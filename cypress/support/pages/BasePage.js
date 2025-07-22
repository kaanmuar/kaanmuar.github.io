// cypress/support/pages/BasePage.js

/**
 * This is a base class that all other Page Objects will inherit from.
 * It contains common functionalities that can be reused across different pages,
 * such as visiting a URL with specific configurations.
 */
export class BasePage {
    /**
     * Navigates to a specified URL path.
     * CRITICAL: It includes the 'onBeforeLoad' logic to set a sessionStorage item.
     * This prevents the "Welcome Tour" from automatically running during our tests,
     * which makes them more stable and predictable.
     * @param {string} path - The URL path to visit (e.g., 'index.html' or 'admin.html').
     */
    visit(path) {
        cy.visit(path, {
            onBeforeLoad(win) {
                // This command runs before any of the page's scripts.
                // It tricks the page into thinking the tour has already been seen.
                win.sessionStorage.setItem('hasSeenTour', 'true');
            },
        });
    }

    /**
     * A simple helper to get the main page title.
     * This is just an example of a shared method.
     */
    getPageTitle() {
        return cy.title();
    }
}
