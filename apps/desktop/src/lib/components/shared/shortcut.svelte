<script lang="ts">
	import shortcut, { type ShortcutParams } from '@/actions/shortcut';

	let {
		options,
		callback = undefined
	}: {
		options: ShortcutParams;
		callback?: () => void;
	} = $props();
</script>

<div class="hidden" use:shortcut={{ ...options, callback }}></div>
