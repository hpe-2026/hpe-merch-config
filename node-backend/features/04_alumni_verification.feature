Feature: Alumni User Verification and Approval Workflow

  As an admin user
  I want to manage alumni user registrations
  So that only verified alumni can access the merchandise shop

  Background:
    Given the system is running
    And the admin user is logged in with email "admin@nitte.com"
    And Kafka topics are ready for events

  Scenario: New user registers and awaits admin approval
    Given a new user provides email "newstudent@nitte.com", password "TestPass123!", name "New Student", and alumni_id "ALM2024001"
    When the user submits the registration form
    Then the user is created in Keycloak
    And the user verification record status is "pending"
    And a Kafka event "unverified-users" is published
    And the user receives a "Registration successful. Awaiting admin approval." response
    And the admin can see this user in the unverified users list

  Scenario: Admin approves a pending user
    Given an unverified user exists with email "pending@nitte.com" and alumni_id "ALM2024002"
    And the user verification status is "pending"
    When the admin approves the user with reason "Verified alumni credentials"
    Then the user verification status changes to "approved"
    And the approval timestamp is recorded
    And the approved_by field shows the admin email
    And a Kafka event "user-approved" is published
    And the notification service receives and processes the approval event

  Scenario: Admin rejects a pending user
    Given an unverified user exists with email "rejected@nitte.com" and alumni_id "ALM2024003"
    And the user verification status is "pending"
    When the admin rejects the user with reason "Alumni ID could not be verified"
    Then the user verification status changes to "rejected"
    And the rejection timestamp is recorded
    And the rejected_by field shows the admin email
    And a Kafka event "user-rejected" is published
    And the notification service receives and processes the rejection event

  Scenario: Approved user can log in to the system
    Given a user with email "approved@nitte.com" has been approved
    And the user verification status is "approved"
    When the user attempts to login with email "approved@nitte.com" and password "TestPass123!"
    Then the login is successful
    And the user receives an access token
    And the user can access protected endpoints

  Scenario: Rejected user cannot log in
    Given a user with email "rejected@nitte.com" has been rejected
    And the user verification status is "rejected"
    When the user attempts to login with email "rejected@nitte.com"
    Then the login fails with message "Account not approved yet"
    And the user receives a 403 Forbidden response

  Scenario: Pending user cannot log in until approved
    Given an unverified user exists with email "waiting@nitte.com"
    And the user verification status is "pending"
    When the user attempts to login with email "waiting@nitte.com"
    Then the login fails with message "Account not approved yet"
    And the user receives a 403 Forbidden response

  Scenario: Admin can view unverified users with pagination
    Given 15 unverified users exist in the system
    When the admin requests the unverified users list with skip=5 and limit=10
    Then the response contains 10 users
    And the total count is 15
    And the returned users skip offset is 5

  Scenario: Event history is maintained during verification process
    Given an unverified user exists with email "history@nitte.com"
    When the admin approves the user
    Then the event history contains:
      | type       | actor                |
      | registered | system               |
      | approved   | admin@nitte.com      |

  Scenario: Multiple admins can manage user approvals
    Given two admin users exist: "admin1@nitte.com" and "admin2@nitte.com"
    And an unverified user exists with email "multiapproval@nitte.com"
    When "admin1@nitte.com" approves the user with reason "First review approved"
    Then the user status is "approved"
    And the approved_by field shows "admin1@nitte.com"
    When another admin tries to approve the same user again
    Then the action fails with message "User cannot be approved. Current status: approved"

  Scenario: Registration with missing alumni_id still works
    Given a new user provides email "noid@nitte.com", password "TestPass123!", name "No ID User", and no alumni_id
    When the user submits the registration form
    Then the user is created successfully
    And the alumni_id field is empty
    And the verification record can still be approved by admin

  Scenario: Notification emails are sent on approval
    Given the email service is enabled with provider "console"
    And an unverified user exists with email "emailtest@nitte.com" and name "Email Test"
    When the admin approves the user with reason "Verified"
    Then the notification service logs an approval email:
      | field   | contains           |
      | to      | emailtest@nitte.com |
      | subject | Approved           |
      | text    | Email Test         |

  Scenario: Notification emails are sent on rejection
    Given the email service is enabled with provider "console"
    And an unverified user exists with email "rejecttest@nitte.com" and name "Reject Test"
    When the admin rejects the user with reason "Invalid credentials"
    Then the notification service logs a rejection email:
      | field   | contains            |
      | to      | rejecttest@nitte.com |
      | subject | Status Update       |
      | text    | Reject Test         |
