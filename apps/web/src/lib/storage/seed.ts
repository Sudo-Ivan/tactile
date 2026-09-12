import {
	COLLECTION_SETTINGS_PATH,
	COLLECTIONS_PATH,
	BASE_COLLECTION_SETTINGS,
	DAILY_NOTES_DIR,
	MARKDOWN_EXTENSION
} from '@/constants';
import type { StorageBackend } from '@tactile/storage';

const COLLECTION_PATH = '/Tactile';
const COLLECTION_NAME = 'Tactile';

const README = `Tactile is a new local-first & privacy-focused, open-source home for your markdown notes. It's minimal, lightweight, efficient, and aims to have _all you need and nothing you don't_.

---

If you'd like to learn more about Tactile, why it's being built, what its goals are, and how it differs from all the other markdown editors out there, click around the other files in this collection.

## Tech Stack

- [Tauri](https://tauri.app/) – Desktop App
- [Svelte](https://kit.svelte.dev/) – Framework
- [Tailwind](https://tailwindcss.com/) – CSS
- [Shadcn/ui](https://www.shadcn-svelte.com/) – Component Library

## Deploy Your Own

If you're interested in self-hosting your own web instance of Tactile, please check [GitHub](https://github.com/Sudo-Ivan/tactile/github) for instructions.

## Roadmap

Tactile is currently still in active development. Here are some of the features planned for the future:

- [ ] Tactile Sync
- [ ] Native mobile apps for iOS & Android
- [ ] Windows & Linux support for the desktop app

and much, much more, so stay tuned!

## Contributing

We would love to have your help in making Tactile better!

Here's how you can contribute:

- [Report a bug](https://github.com/Sudo-Ivan/tactile/issues/new?labels=bug) you found while using Tactile
- [Request a feature](https://github.com/Sudo-Ivan/tactile/issues/new?labels=enhancement) that you think will be useful
- [Submit a pull request](https://github.com/Sudo-Ivan/tactile/pulls) if you want to contribute with new features or bug fixes

## License

Tactile is licensed under the [GNU Affero General Public License Version 3 (AGPLv3)](https://github.com/Sudo-Ivan/tactile/blob/main/LICENSE).
`;

const SUPPORTED_DEVICES = `Tactile offers a seamless experience across multiple platforms, with ongoing development to expand accessibility.

### Currently Supported

#### Mac
* **Full Support**: Enjoy the complete Tactile experience with the dedicated macOS application

#### Web
* **Browser Access**: Use Tactile directly in your web browser, from any device

### Coming Soon

We're actively working to bring Tactile to more platforms:

#### Windows
* Dedicated application in active development

#### Linux
* Support planned for future releases

#### Mobile
* Native apps for smartphones and tablets on the horizon

Stay tuned for updates as we expand Tactile's reach across devices and operating systems! You can support our development efforts by [sponsoring the project](https://github.com/Sudo-Ivan/tactile/sponsor).
`;

const WHY_TACTILE = `We built Tactile to make markdown writing simpler and more accessible. We believe that many existing editors are too complex for simple use cases and day-to-day note writing, so we decided to fix that.

### What Makes Tactile Special

1. **Ready to Use**: Open Tactile and start writing. No setup needed.
2. **Simple Design**: Clean interface so you can focus on your writing.
3. **Write Anywhere**: Use Tactile on any computer with internet. Great for public or work computers where you can't download software.
4. **Made for Everyone**: If other editors feel overwhelming, you'll like Tactile.
5. **Open Source**: Self-host your own instance, giving you full control over your setup.

---

**Note**: If you're looking for a markdown editor with plugin systems, complex setups, or feature-packed interfaces, Tactile might not be for you. But if you want something straightforward that just works, give Tactile a try!
`;

const DAILY_NOTE_BODY = (date: Date) =>
	`This is just a simple description of what needs to be done today.\n- [ ] Daily Task for ${formatDailyLabel(date)}`;

function formatDailyLabel(date: Date): string {
	const day = date.getDate();
	const suffix = day >= 11 && day <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th';
	return `${day}${suffix} ${date.toLocaleString('en-US', { month: 'short' })} ${date.getFullYear()}`;
}

function toDateName(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

// Writes the default Tactile collection when the store is completely empty
// (fresh install or just-migrated store with no collections.json).
export async function seedIfEmpty(backend: StorageBackend): Promise<void> {
	if (await backend.exists(COLLECTIONS_PATH)) return;

	const noVersion = { keepVersion: false };

	await backend.mkdir(`${COLLECTION_PATH}${DAILY_NOTES_DIR}`, { recursive: true, ...noVersion });
	await backend.mkdir(`${COLLECTION_PATH}/.tactile/trash`, { recursive: true, ...noVersion });
	await backend.mkdir(`${COLLECTION_PATH}/.tactile/versions`, {
		recursive: true,
		...noVersion
	});

	await backend.writeTextFile(`${COLLECTION_PATH}/README.md`, README, noVersion);
	await backend.writeTextFile(
		`${COLLECTION_PATH}/Supported Devices.md`,
		SUPPORTED_DEVICES,
		noVersion
	);
	await backend.writeTextFile(`${COLLECTION_PATH}/Why Tactile.md`, WHY_TACTILE, noVersion);

	await backend.writeTextFile(
		`${COLLECTION_PATH}/${COLLECTION_SETTINGS_PATH}`,
		JSON.stringify(BASE_COLLECTION_SETTINGS),
		noVersion
	);

	for (let i = 0; i < 10; i++) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const name = toDateName(date);
		await backend.writeTextFile(
			`${COLLECTION_PATH}${DAILY_NOTES_DIR}/${name}${MARKDOWN_EXTENSION}`,
			DAILY_NOTE_BODY(date),
			noVersion
		);
	}

	await backend.mkdir('/.tactile', { recursive: true, ...noVersion });
	await backend.writeTextFile(
		COLLECTIONS_PATH,
		JSON.stringify([
			{
				path: COLLECTION_PATH,
				name: COLLECTION_NAME,
				lastOpened: new Date().toISOString()
			}
		]),
		noVersion
	);
}
