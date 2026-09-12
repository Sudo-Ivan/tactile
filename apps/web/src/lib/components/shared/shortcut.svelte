<script lang="ts">
	import shortcut, { type ShortcutParams } from '@/actions/shortcut';

	interface Props {
		options: ShortcutParams;
		callback?: () => void;
	}

	let { options, callback }: Props = $props();
</script>

<div class="hidden" use:shortcut={{ ...options, callback }}></div>
