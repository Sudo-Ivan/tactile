import { describe, expect, it } from 'vitest';

import { hslToHex } from './theme';

describe('hslToHex', () => {
	it('converts the primary colors', () => {
		expect(hslToHex('0 100% 50%')).toBe('#ff0000');
		expect(hslToHex('120 100% 50%')).toBe('#00ff00');
		expect(hslToHex('240 100% 50%')).toBe('#0000ff');
	});

	it('converts achromatic values', () => {
		expect(hslToHex('0 0% 0%')).toBe('#000000');
		expect(hslToHex('210 0% 50%')).toBe('#808080');
		expect(hslToHex('0 0% 100%')).toBe('#ffffff');
	});

	it('converts partial saturation and lightness', () => {
		// h=200 s=50% l=50% -> rgb(64, 149, 191)
		expect(hslToHex('200 50% 50%')).toBe('#4095bf');
		// h=348 s=73% l=45% -> rgb(199, 31, 64)
		expect(hslToHex('348 73% 45%')).toBe('#c71f40');
	});
});
