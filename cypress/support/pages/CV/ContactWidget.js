// cypress/support/pages/CV/ContactWidget.js

/**
 * Represents the floating Contact Widget component.
 * This class encapsulates all interactions within the widget,
 * such as switching tabs and submitting the rating or message forms.
 */
export class ContactWidget {
    // --- Selectors ---
    get fabButton() { return cy.get('#contact-widget-fab'); }
    get ratingTab() { return cy.get('#rating-tab'); }
    get messageTab() { return cy.get('#message-tab'); }
    get successMessageContainer() { return cy.get('#widget-status-container'); }

    // Rating Form Selectors
    get raterNameInput() { return cy.get('#rater-name'); }
    get raterEmailInput() { return cy.get('#rater-email'); }
    get raterCommentInput() { return cy.get('#rater-comment'); }
    get sendRatingButton() { return cy.get('#send-rating-btn'); }

    // Message Form Selectors
    get senderNameInput() { return cy.get('#sender-name'); }
    get senderEmailInput() { return cy.get('#sender-email'); }
    get messageTopicDropdown() { return cy.get('#message-topic'); }
    get senderMessageInput() { return cy.get('#sender-message'); }
    get sendMessageButton() { return cy.get('#send-message-btn'); }

    // --- Actions ---

    /**
     * Opens the contact widget by clicking the floating action button.
     * It returns 'this' to allow for chaining commands (e.g., widget.open().switchToRatingTab()).
     */
    open() {
        this.fabButton.click();
        return this;
    }

    /**
     * Switches to the "Rate Me" tab within the widget.
     */
    switchToRatingTab() {
        this.ratingTab.click();
        return this;
    }

    /**
     * Fills out and submits the rating form.
     * @param {object} ratingData - An object containing rating info.
     * @param {number} ratingData.stars - The star rating value (1-5).
     * @param {string} ratingData.name - The rater's name.
     * @param {string} ratingData.email - The rater's email.
     * @param {string} ratingData.comment - The rater's comment.
     */
    submitRating(ratingData) {
        cy.get(`#star-rating .star[data-value="${ratingData.stars}"]`).click();
        this.raterNameInput.type(ratingData.name);
        this.raterEmailInput.type(ratingData.email);
        this.raterCommentInput.type(ratingData.comment);
        this.sendRatingButton.click();
    }

    /**
     * Fills out and submits the message form.
     * @param {object} messageData - An object containing message info.
     * @param {string} messageData.name - The sender's name.
     * @param {string} messageData.email - The sender's email.
     * @param {string} messageData.topic - The message topic to select from the dropdown.
     * @param {string} messageData.message - The message content.
     */
    submitMessage(messageData) {
        this.senderNameInput.type(messageData.name);
        this.senderEmailInput.type(messageData.email);
        this.messageTopicDropdown.select(messageData.topic);
        this.senderMessageInput.type(messageData.message);
        this.sendMessageButton.click();
    }

    // --- Verifications ---

    /**
     * Verifies that the success/status message is visible after form submission.
     */
    verifySuccessMessageIsVisible() {
        this.successMessageContainer.should('be.visible');
    }
}
