// cypress/e2e/admin_spec.cy.js (Final, All Tests Included)

import { LoginPage } from '../support/pages/Admin/LoginPage';
import { AdminDashboardPage } from '../support/pages/Admin/AdminDashboardPage';
import { ContactWidget } from '../support/pages/CV/ContactWidget';
import { CVPage } from '../support/pages/CV/CVPage';



// Instantiate all the Page Objects we need for the entire suite.
const loginPage = new LoginPage();
const adminDashboard = new AdminDashboardPage();
const contactWidget = new ContactWidget();
const cvPage = new CVPage();

describe('Admin Panel Test Suite', () => {

    // --- Helper function to create a new testimonial for multiple tests ---
    // This reduces code duplication and makes tests cleaner.
    const createTestimonial = (data) => {
        cy.log(`--- Creating Testimonial: ${data.comment} ---`);
        cvPage.visitCV();
        contactWidget.open()
            .switchToRatingTab()
            .submitRating(data);
        contactWidget.verifySuccessMessageIsVisible();
    };

    // --- Helper function for creating a new message ---
    const createMessage = (data) => {
        cy.log(`--- Creating Message: ${data.message} ---`);
        cvPage.visitCV();
        contactWidget.open().submitMessage(data);
        contactWidget.verifySuccessMessageIsVisible();
    };

    context('Admin Authentication', () => {
        it('should fail to login with incorrect credentials', () => {
            loginPage.visitAdminPage();
            loginPage.login('wrong@user.com', 'wrongpassword');
            loginPage.verifyLoginErrorIsVisible();
        });

        it('should successfully log in and log out', () => {
            cy.loginWithSession();
            adminDashboard.visitDashboard();
            adminDashboard.verifyDashboardIsVisible();
            adminDashboard.logout();
            loginPage.verifyIsLoggedOut();
        });
    });

    context('Admin Dashboard and E2E Flows', () => {
        // Log in once before each test in this context for maximum efficiency.
        beforeEach(() => {
            cy.loginWithSession();
            adminDashboard.visitDashboard();
        });

        it('should switch between all tabs', () => {
            adminDashboard.navigateToRatingsTab();
            cy.get('#ratings-pane').should('be.visible');

            adminDashboard.navigateToBlocklistTab();
            cy.get('#blocklist-pane').should('be.visible');

            adminDashboard.navigateToMessagesTab();
            cy.get('#messages-pane').should('be.visible');
        });

        it('should display the correct action buttons based on the rating status', () => {
            // This test verifies the UI logic for different testimonial states.
            const testData = { stars: 5, name: 'State Tester', comment: `Button State Test ${Date.now()}` };
            createTestimonial(testData);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();

            // 1. Verify 'pending' state buttons
            adminDashboard.verifyActionButtonsForState('pending');

            // 2. Approve and verify 'approved' state buttons
            adminDashboard.approveTestimonial(testData.comment);
            adminDashboard.verifyActionButtonsForState('approved');

            // 3. Retract and then reject to verify 'rejected' state buttons
            adminDashboard.retractTestimonial(testData.comment);
            adminDashboard.rejectTestimonial(testData.comment);
            adminDashboard.verifyActionButtonsForState('rejected');
        });

        it('should handle the full standard testimonial lifecycle (Submit > Approve > Retract)', () => {
            const testData = { stars: 5, name: 'Standard Tester', comment: `Standard Lifecycle ${Date.now()}` };
            createTestimonial(testData);

            // Approve
            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.approveTestimonial(testData.comment);
            adminDashboard.verifyCardStatus(testData.comment, 'approved');
            adminDashboard.verifyTestimonialIsPublic(testData.comment);

            // Retract
            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.retractTestimonial(testData.comment);
            adminDashboard.verifyCardStatus(testData.comment, 'pending');
            adminDashboard.verifyTestimonialIsRemoved(testData.comment);
        });

        it('should handle the anonymous approval lifecycle', () => {
            const testData = { stars: 4, name: 'Anon Tester', comment: `Anonymous Lifecycle ${Date.now()}` };
            createTestimonial(testData);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.approveTestimonialAnonymously(testData.comment);
            adminDashboard.verifyTestimonialIsAnonymous(testData.comment);
        });

        it('should handle the rejection lifecycle', () => {
            const testData = { stars: 1, name: 'Reject Tester', comment: `Rejection Lifecycle ${Date.now()}` };
            createTestimonial(testData);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.rejectTestimonial(testData.comment);
            adminDashboard.verifyCardStatus(testData.comment, 'rejected');
            adminDashboard.verifyTestimonialIsRemoved(testData.comment);
        });

        it('should handle the message receipt lifecycle', () => {
            const messageData = { name: 'Message Sender', email: `msg-${Date.now()}@test.com`, topic: 'Project Inquiry', message: `Message Lifecycle Test ${Date.now()}` };
            createMessage(messageData);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToMessagesTab();
            // Verifying the card exists is sufficient for this test.
            adminDashboard.findCardByContent(messageData.message).should('be.visible');
        });

        it('should handle the full block/unblock sender lifecycle', () => {
            const emailToBlock = `block-me-${Date.now()}@test.com`;
            const messageData = { name: 'Blockable User', email: emailToBlock, topic: 'Other', message: `Block/Unblock Test ${Date.now()}` };
            createMessage(messageData);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToMessagesTab();

            // Stub window:confirm to auto-accept the dialog
            cy.on('window:confirm', () => true);

            // Block the user
            adminDashboard.blockSenderFromCard(messageData.message);

            // Verify they are in the blocklist
            adminDashboard.navigateToBlocklistTab();
            adminDashboard.verifyUserInBlocklist(emailToBlock);

            // Unblock the user
            adminDashboard.unblockUser(emailToBlock);
            adminDashboard.verifyUserNotInBlocklist(emailToBlock);
        });
    });
});
