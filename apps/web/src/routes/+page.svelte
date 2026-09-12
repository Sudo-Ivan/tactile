<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<!-- The load function redirects to /notes; this only renders if the
     redirect is unavailable (e.g. during prerender). -->
<div class="flex h-full w-full items-center justify-center">
	<p class="text-muted-foreground text-sm">
		Redirecting to <a href={resolve('/notes')} class="underline">notes</a>...
	</p>
</div>
