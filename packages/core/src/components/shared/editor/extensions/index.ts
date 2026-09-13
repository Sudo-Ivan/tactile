import type { Extensions } from '@tiptap/core';
import CharacterCount from '@tiptap/extension-character-count';
import Document from '@tiptap/extension-document';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Typography } from '@tiptap/extension-typography';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Attachment } from './attachment';
import { TactileCodeBlock } from './code-block';
import { TactileBlockMath, TactileInlineMath } from './math';
import { SearchAndReplace } from './searchAndReplace';
import { WikiLink } from './wikilink';

export * from './searchAndReplace';
export default SearchAndReplace;

const katexOptions = { throwOnError: false, strict: 'warn' as const, trust: false };

// The shared extension set: editor.svelte adds FileHandler on top since
// its callbacks need the live editor instance.
export function buildEditorExtensions(): Extensions {
	return [
		StarterKit.configure({
			document: false,
			hardBreak: false,
			// replaced by TactileCodeBlock (lowlight + mermaid preview)
			codeBlock: false,
			link: {
				HTMLAttributes: {
					class:
						'text-primary underline hover:text-primary/80 transition-all cursor-pointer text-base [&>*]:font-normal'
				}
			},
			paragraph: {
				HTMLAttributes: {
					class: 'min-w-[1px] my-1 leading-5'
				}
			}
		}),
		CharacterCount,
		Document,
		TactileCodeBlock,
		TactileInlineMath.configure({ katexOptions }),
		TactileBlockMath.configure({ katexOptions }),
		Attachment,
		WikiLink,
		SearchAndReplace.configure({
			searchResultClass: 'search-result',
			disableRegex: false
		}),
		Typography,
		TaskList,
		TaskItem.configure({
			HTMLAttributes: {
				class:
					'flex items-start pl-1.5 gap-2 [&>div]:mb-0 [&>label]:mt-0 [&>div]:w-full [&>div>p]:inline-block [&>label]:inline-flex [&>label]:items-center [&>label>input]:rounded-md'
			},
			nested: true
		}),
		Markdown.configure({
			linkify: true,
			transformPastedText: true
		})
	];
}
