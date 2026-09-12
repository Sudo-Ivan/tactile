interface DeviceInfo {
	isDesktop: boolean;
	isMobileOrTablet: boolean;
}

export function createDeviceDetector() {
	const device = $state<DeviceInfo>({
		isDesktop: false,
		isMobileOrTablet: false
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

		const detectDevice = () => {
			// Check for touch capability
			const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

			// Check for laptop-specific indicators
			const hasMouseEvents = 'onmousemove' in window;
			const hasKeyboard = 'onkeydown' in window;

			// Check for mobile-specific browser features
			const hasMobileUserAgent =
				/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

			// Check screen size and pixel ratio
			const smallScreen = window.screen.width < 768 || window.screen.height < 768;
			const highPixelRatio = window.devicePixelRatio > 1.5;

			const isMobileOrTablet = (() => {
				if (hasTouch && hasMobileUserAgent) {
					return true; // Definitely mobile or tablet
				} else if (hasTouch && (smallScreen || highPixelRatio)) {
					// Additional checks for touchscreen laptops
					if (hasMouseEvents && hasKeyboard) {
						return false; // Likely a touchscreen laptop
					} else {
						return true; // Likely mobile or tablet
					}
				} else {
					return false; // Likely not mobile or tablet
				}
			})();

			device.isDesktop = !isMobileOrTablet;
			device.isMobileOrTablet = isMobileOrTablet;
		};

		// Initial detection
		detectDevice();

		// Listener for orientation change and resize
		window.addEventListener('orientationchange', detectDevice);
		window.addEventListener('resize', detectDevice);

		// Cleanup listeners
		return () => {
			window.removeEventListener('orientationchange', detectDevice);
			window.removeEventListener('resize', detectDevice);
		};
	});

	return device;
}
