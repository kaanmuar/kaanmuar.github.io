import type { CapacitorConfig } from '@capacitor/cli';

const productionServer = 'https://carlosandmunoz.com/qa-review.html';

const config: CapacitorConfig = {
	appId: 'com.carlosandmunoz.urlreview',
	appName: 'URL Review',
	webDir: 'www',
	server: {
		// Wrap the live qa-review web app; override for local dev (see README).
		url: process.env.CAPACITOR_SERVER_URL || productionServer,
		cleartext: false,
		androidScheme: 'https',
		iosScheme: 'https',
	},
	ios: {
		contentInset: 'automatic',
		limitsNavigationsToAppBoundDomains: false,
	},
};

export default config;