use super::search_engine::{self, MatchMode, SearchResult};

#[tauri::command]
pub async fn search_files(
    dir_path: String,
    query: String,
    case_sensitive: bool,
    recursive: bool,
    match_word: bool,
    extension: Option<String>,
    // 'fuzzy' (default), 'word' or 'exact'. Overrides match_word when set.
    mode: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    // The command historically takes an extension filter; we only support
    // markdown and keep the parameter for backwards compatibility.
    let _ = extension;
    let mode_override = mode.as_deref().and_then(|m| match m {
        "word" => Some(MatchMode::Word),
        "exact" => Some(MatchMode::Exact),
        "fuzzy" => Some(MatchMode::Fuzzy),
        _ => None,
    });
    search_engine::search(
        &dir_path,
        &query,
        case_sensitive,
        recursive,
        match_word,
        mode_override,
    )
}
