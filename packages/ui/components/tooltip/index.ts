import { Tooltip as TooltipPrimitive } from 'bits-ui';
import Root from './tooltip-root.svelte';
import Content from './tooltip-content.svelte';

const Trigger = TooltipPrimitive.Trigger;
const Arrow = TooltipPrimitive.Arrow;
const Provider = TooltipPrimitive.Provider;

export {
	Root,
	Trigger,
	Content,
	Arrow,
	Provider,
	//
	Root as Tooltip,
	Content as TooltipContent,
	Trigger as TooltipTrigger,
	Arrow as TooltipArrow,
	Provider as TooltipProvider
};
