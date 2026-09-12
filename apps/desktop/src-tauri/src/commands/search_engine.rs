// Fuzzy/smart full-text search over a collection of markdown files.
//
// Pure std logic kept in its own module so it can be tested without the
// tauri runtime (rustc --test works even where webkit deps are missing).
// The scoring mirrors apps/web/src/lib/utils/fuzzy.ts so search ranks the
// same on web and desktop.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const SCORE_MATCH: i32 = 10;
const BONUS_BOUNDARY: i32 = 8;
const BONUS_CAMEL: i32 = 6;
const BONUS_CONSECUTIVE: i32 = 8;
const PENALTY_GAP: i32 = 1;

const MAX_MATCHES_PER_FILE: usize = 12;
const MAX_RESULTS: usize = 400;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchMode {
    Fuzzy,
    Word,
    Exact,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    /// Absolute path so callers can open the file directly.
    pub path: String,
    /// 'name' matched the file name, 'content' matched a line.
    pub kind: String,
    /// 1-based line number for content matches. Serialized as `line` to
    /// match the shared SearchResultParams type in @tactile/core.
    #[serde(rename = "line")]
    pub line_number: Option<usize>,
    pub context_preview: String,
    pub score: i32,
    /// [start, end) highlight ranges in context_preview, UTF-16 code units.
    pub highlights: Vec<(u32, u32)>,
}

#[derive(Debug)]
struct FuzzyMatch {
    score: i32,
    /// Matched character indices (char, not byte) into the text.
    indices: Vec<usize>,
}

fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric()
}

/// Bonus for a match at char index i in text: start of string or after a
/// separator gets the boundary bonus, camelCase transitions a smaller one.
fn boundary_bonus(chars: &[char], i: usize) -> i32 {
    if i == 0 {
        return BONUS_BOUNDARY;
    }
    let prev = chars[i - 1];
    if !is_word_char(prev) {
        return BONUS_BOUNDARY;
    }
    if prev.is_lowercase() && chars[i].is_uppercase() {
        return BONUS_CAMEL;
    }
    0
}

fn to_chars(s: &str, case_sensitive: bool) -> Vec<char> {
    if case_sensitive {
        s.chars().collect()
    } else {
        s.to_lowercase().chars().collect()
    }
}

/// Greedy subsequence match: every pattern char must appear in order.
fn fuzzy_match(pattern: &[char], text: &str, case_sensitive: bool) -> Option<FuzzyMatch> {
    if pattern.is_empty() {
        return Some(FuzzyMatch {
            score: 0,
            indices: Vec::new(),
        });
    }
    let hay: Vec<char> = to_chars(text, case_sensitive);
    let raw: Vec<char> = text.chars().collect();
    if pattern.len() > hay.len() {
        return None;
    }

    let mut indices = Vec::with_capacity(pattern.len());
    let mut score = 0;
    let mut cursor = 0usize;
    let mut previous: Option<usize> = None;

    for &pc in pattern {
        let found = hay[cursor..].iter().position(|&c| c == pc).map(|p| cursor + p)?;
        indices.push(found);
        score += SCORE_MATCH + boundary_bonus(&raw, found);
        if let Some(prev) = previous {
            if found == prev + 1 {
                score += BONUS_CONSECUTIVE;
            } else {
                score -= (found - prev - 1) as i32 * PENALTY_GAP;
            }
        }
        cursor = found + 1;
        previous = Some(found);
    }

    Some(FuzzyMatch { score, indices })
}

/// Word-boundary substring match.
fn word_match(pattern: &[char], text: &str, case_sensitive: bool) -> Option<FuzzyMatch> {
    if pattern.is_empty() {
        return Some(FuzzyMatch {
            score: 0,
            indices: Vec::new(),
        });
    }
    let hay: Vec<char> = to_chars(text, case_sensitive);
    if pattern.len() > hay.len() {
        return None;
    }

    for start in 0..=(hay.len() - pattern.len()) {
        if hay[start..start + pattern.len()] == *pattern {
            let before_ok = start == 0 || !is_word_char(hay[start - 1]);
            let after_ok =
                start + pattern.len() >= hay.len() || !is_word_char(hay[start + pattern.len()]);
            if before_ok && after_ok {
                return Some(FuzzyMatch {
                    score: (SCORE_MATCH + BONUS_CONSECUTIVE) * pattern.len() as i32
                        + BONUS_BOUNDARY,
                    indices: (start..start + pattern.len()).collect(),
                });
            }
        }
    }
    None
}

/// Literal substring match.
fn exact_match(pattern: &[char], text: &str, case_sensitive: bool) -> Option<FuzzyMatch> {
    if pattern.is_empty() {
        return Some(FuzzyMatch {
            score: 0,
            indices: Vec::new(),
        });
    }
    let hay: Vec<char> = to_chars(text, case_sensitive);
    if pattern.len() > hay.len() {
        return None;
    }
    let raw: Vec<char> = text.chars().collect();
    for start in 0..=(hay.len() - pattern.len()) {
        if hay[start..start + pattern.len()] == *pattern {
            return Some(FuzzyMatch {
                score: (SCORE_MATCH + BONUS_CONSECUTIVE) * pattern.len() as i32
                    + boundary_bonus(&raw, start)
                    + BONUS_BOUNDARY,
                indices: (start..start + pattern.len()).collect(),
            });
        }
    }
    None
}

/// Best match for a single term. Fuzzy mode tries a literal substring first
/// so exact hits always outrank scattered subsequence matches.
fn match_term(
    term: &str,
    text: &str,
    mode: MatchMode,
    case_sensitive: bool,
) -> Option<FuzzyMatch> {
    let pattern: Vec<char> = if case_sensitive {
        term.chars().collect()
    } else {
        term.to_lowercase().chars().collect()
    };
    match mode {
        MatchMode::Word => word_match(&pattern, text, case_sensitive),
        MatchMode::Exact => exact_match(&pattern, text, case_sensitive),
        MatchMode::Fuzzy => {
            exact_match(&pattern, text, case_sensitive)
                .or_else(|| fuzzy_match(&pattern, text, case_sensitive))
        }
    }
}

/// Merge matched char indices into [start, end) ranges measured in UTF-16
/// code units so the JS side can slice with them directly.
fn utf16_ranges(text: &str, indices: &[usize]) -> Vec<(u32, u32)> {
    if indices.is_empty() {
        return Vec::new();
    }
    let mut wanted: Vec<usize> = indices.to_vec();
    wanted.sort_unstable();
    let wanted: std::collections::HashSet<usize> = wanted.into_iter().collect();

    // char index -> utf16 offset
    let mut char_to_utf16: Vec<u32> = Vec::with_capacity(text.chars().count() + 1);
    let mut utf16 = 0u32;
    for c in text.chars() {
        char_to_utf16.push(utf16);
        utf16 += c.len_utf16() as u32;
    }
    char_to_utf16.push(utf16);

    let mut ranges = Vec::new();
    let mut sorted: Vec<usize> = wanted.into_iter().collect();
    sorted.sort_unstable();
    let mut start = sorted[0];
    let mut end = sorted[0] + 1;
    for &idx in &sorted[1..] {
        if idx == end {
            end += 1;
        } else {
            ranges.push((char_to_utf16[start], char_to_utf16[end]));
            start = idx;
            end = idx + 1;
        }
    }
    ranges.push((char_to_utf16[start], char_to_utf16[end]));
    ranges
}

/// Collect markdown files under root. Hidden entries are skipped, except
/// .tactile/daily which holds user-visible daily notes.
fn collect_files(root: &Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = path.is_dir();
        if is_dir {
            if !name.starts_with('.') {
                if recursive {
                    collect_files(&path, recursive, out);
                }
            } else if name == ".tactile" {
                // Only daily notes inside .tactile are real user content.
                let daily = path.join("daily");
                if daily.is_dir() {
                    collect_files(&daily, recursive, out);
                }
            }
        } else if name.to_lowercase().ends_with(".md") && !name.starts_with('.') {
            out.push(path);
        }
    }
}

struct FileResult {
    results: Vec<SearchResult>,
    score: i32,
}

fn search_file(
    rel_path: &str,
    file_name: &str,
    content: &str,
    terms: &[String],
    mode: MatchMode,
    case_sensitive: bool,
) -> Option<FileResult> {
    let mut results = Vec::new();

    // File name match: every term must match the name.
    let mut name_score = 0i32;
    let mut name_indices: Vec<usize> = Vec::new();
    let mut name_matched_all = true;
    for term in terms {
        match match_term(term, file_name, mode, case_sensitive) {
            Some(m) => {
                name_score += m.score;
                name_indices.extend(m.indices);
            }
            None => {
                name_matched_all = false;
                break;
            }
        }
    }
    if name_matched_all {
        results.push(SearchResult {
            path: rel_path.to_string(),
            kind: "name".to_string(),
            line_number: None,
            context_preview: file_name.to_string(),
            score: name_score,
            highlights: utf16_ranges(file_name, &name_indices),
        });
    }

    // Content lines: every term must match the same line.
    let lines: Vec<&str> = content.lines().collect();
    let mut line_results: Vec<SearchResult> = Vec::new();
    let mut best_line = 0i32;

    for (i, line) in lines.iter().enumerate() {
        if line_results.len() >= MAX_MATCHES_PER_FILE {
            break;
        }
        if line.trim().is_empty() {
            continue;
        }
        let mut line_score = 0i32;
        let mut line_indices: Vec<usize> = Vec::new();
        let mut all_terms = true;
        for term in terms {
            match match_term(term, line, mode, case_sensitive) {
                Some(m) => {
                    line_score += m.score;
                    line_indices.extend(m.indices);
                }
                None => {
                    all_terms = false;
                    break;
                }
            }
        }
        if !all_terms {
            continue;
        }
        best_line = best_line.max(line_score);

        let start = i.saturating_sub(1);
        let end = (i + 1).min(lines.len().saturating_sub(1));
        let context = lines[start..=end].join("\n");
        // Shift char indices of the matched line into the context window,
        // then convert to UTF-16 ranges for the JS consumer.
        let line_char_offset: usize = lines[start..i].iter().map(|l| l.chars().count() + 1).sum();
        let shifted: Vec<usize> = line_indices.iter().map(|&x| x + line_char_offset).collect();
        line_results.push(SearchResult {
            path: rel_path.to_string(),
            kind: "content".to_string(),
            line_number: Some(i + 1),
            context_preview: context.clone(),
            score: line_score,
            highlights: utf16_ranges(&context, &shifted),
        });
    }

    if !name_matched_all {
        // Without a name match every term must still appear in the content.
        let content_matched = terms
            .iter()
            .all(|t| match_term(t, content, mode, case_sensitive).is_some());
        if !content_matched || line_results.is_empty() {
            return None;
        }
    }

    line_results.sort_by(|a, b| b.score.cmp(&a.score));
    let match_count = line_results.len() as i32;
    results.extend(line_results);

    let score = (if name_matched_all { name_score + 100 } else { 0 }) + best_line + match_count * 3;
    Some(FileResult { results, score })
}

pub fn search(
    dir_path: &str,
    query: &str,
    case_sensitive: bool,
    recursive: bool,
    match_word: bool,
    mode_override: Option<MatchMode>,
) -> Result<Vec<SearchResult>, String> {
    let terms: Vec<String> = query.split_whitespace().map(|s| s.to_string()).collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let mode = mode_override.unwrap_or(if match_word {
        MatchMode::Word
    } else {
        MatchMode::Fuzzy
    });

    let root = PathBuf::from(dir_path);
    if !root.is_dir() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    let mut files = Vec::new();
    collect_files(&root, recursive, &mut files);

    let mut per_file: Vec<FileResult> = Vec::new();
    for file in files {
        // Absolute paths: plugin-fs cannot resolve relative ones, so the UI
        // needs the real path to open results.
        let rel = file.to_string_lossy().to_string();
        let file_name = file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };
        if let Some(result) = search_file(
            &rel, &file_name, &content, &terms, mode, case_sensitive,
        ) {
            per_file.push(result);
        }
    }

    per_file.sort_by(|a, b| b.score.cmp(&a.score));
    let mut out: Vec<SearchResult> = per_file.into_iter().flat_map(|f| f.results).collect();
    out.truncate(MAX_RESULTS);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fuzzy(pattern: &str, text: &str) -> Option<FuzzyMatch> {
        fuzzy_match(&pattern.to_lowercase().chars().collect::<Vec<_>>(), text, false)
    }

    #[test]
    fn fuzzy_matches_subsequence_in_order() {
        assert!(fuzzy("nmd", "normalized").is_some());
        assert!(fuzzy("dnm", "normalized").is_none());
    }

    #[test]
    fn fuzzy_is_case_insensitive() {
        assert!(fuzzy("TODO", "todo list").is_some());
    }

    #[test]
    fn consecutive_beats_scattered() {
        let tight = fuzzy("meet", "meeting notes").unwrap();
        let loose = fuzzy("meet", "m e e t").unwrap();
        assert!(tight.score > loose.score);
    }

    #[test]
    fn boundary_beats_midword() {
        let boundary = fuzzy("list", "shopping list").unwrap();
        let midword = fuzzy("list", "playlisted").unwrap();
        assert!(boundary.score > midword.score);
    }

    #[test]
    fn word_match_requires_boundaries() {
        let pat: Vec<char> = "cat".chars().collect();
        assert!(word_match(&pat, "the cat sat", false).is_some());
        assert!(word_match(&pat, "concatenate", false).is_none());
    }

    #[test]
    fn exact_is_preferred_over_fuzzy() {
        let m = match_term("notes", "my notes file", MatchMode::Fuzzy, false).unwrap();
        assert_eq!(m.indices, vec![3, 4, 5, 6, 7]);
        assert!(match_term("ntf", "my notes file", MatchMode::Exact, false).is_none());
        assert!(match_term("ntf", "my notes file", MatchMode::Fuzzy, false).is_some());
    }

    #[test]
    fn utf16_ranges_merge_and_count_bmp() {
        // 'é' is 1 utf16 unit, emoji is 2.
        let ranges = utf16_ranges("aéb", &[0, 1, 2]);
        assert_eq!(ranges, vec![(0, 3)]);
        let ranges = utf16_ranges("a\u{1F600}b", &[0, 2]);
        // 'a' at 0..1, 'b' at utf16 index 3 (emoji takes 2 units)
        assert_eq!(ranges, vec![(0, 1), (3, 4)]);
    }

    #[test]
    fn search_file_requires_all_terms() {
        let r = search_file(
            "n.md",
            "n.md",
            "alpha beta\ngamma",
            &["alpha".into(), "delta".into()],
            MatchMode::Fuzzy,
            false,
        );
        assert!(r.is_none());
    }

    #[test]
    fn search_file_name_match_wins() {
        let r = search_file(
            "meeting.md",
            "meeting.md",
            "unrelated",
            &["meet".into()],
            MatchMode::Fuzzy,
            false,
        )
        .unwrap();
        assert_eq!(r.results[0].kind, "name");
    }
}
