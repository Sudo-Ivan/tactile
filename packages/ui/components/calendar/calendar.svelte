<script lang="ts">
	import { Calendar as CalendarPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import * as Calendar from './index.js';
	import { cn } from '../../lib/utils';

	type Props = Omit<
		WithoutChildrenOrChild<Extract<CalendarPrimitive.RootProps, { type: 'single' }>>,
		'type'
	> & {
		type?: 'single';
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		weekdayFormat = 'short',
		type = 'single',
		class: className,
		...rest
	}: Props = $props();
</script>

<CalendarPrimitive.Root
	{type}
	bind:value
	bind:placeholder
	bind:ref
	{weekdayFormat}
	class={cn('p-1.5', className)}
	{...rest}
>
	{#snippet children({ months, weekdays })}
		<Calendar.Header>
			<Calendar.PrevButton />
			<Calendar.Heading />
			<Calendar.NextButton />
		</Calendar.Header>
		<Calendar.Months>
			{#each months as month (month.value.toString())}
				<Calendar.Grid>
					<Calendar.GridHead>
						<Calendar.GridRow class="flex">
							{#each weekdays as weekday (weekday)}
								<Calendar.HeadCell>
									{weekday.slice(0, 2)}
								</Calendar.HeadCell>
							{/each}
						</Calendar.GridRow>
					</Calendar.GridHead>
					<Calendar.GridBody>
						{#each month.weeks as weekDates (weekDates[0].toString())}
							<Calendar.GridRow class="mt-1 w-full">
								{#each weekDates as date (date.toString())}
									<Calendar.Cell {date} month={month.value}>
										<Calendar.Day />
									</Calendar.Cell>
								{/each}
							</Calendar.GridRow>
						{/each}
					</Calendar.GridBody>
				</Calendar.Grid>
			{/each}
		</Calendar.Months>
	{/snippet}
</CalendarPrimitive.Root>
