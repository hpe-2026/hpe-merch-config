Feature: Alumni Registration and Verification
  As a new alumni user
  I want to register with my alumni ID
  So that I can access alumni-exclusive features after approval

  Background:
    Given the authentication service is running
    And the notification service is running
    And the admin user exists with email "admin@nitte.com"

  Scenario: Successful alumni registration with valid credentials
    When I submit a registration request with:
      | email      | newalumni@example.com |
      | password   | SecurePass123!        |
      | name       | John Doe              |
      | alumni_id  | ALM20230456           |
    Then I should receive a 201 response
    And the response message should contain "Registration successful"
    And my account status should be "pending"
    And I should not have tokens immediately

  Scenario: Registration fails with invalid alumni ID format
    When I submit a registration request with:
      | email      | invalid@example.com |
      | password   | SecurePass123!      |
      | name       | Jane Smith          |
      | alumni_id  | INVALID             |
    Then I should receive a 400 response
    And the response should contain a validation error

  Scenario: Registration fails with weak password
    When I submit a registration request with:
      | email      | weak@example.com |
      | password   | weak             |
      | name       | Alice Johnson    |
      | alumni_id  | ALM20240001      |
    Then I should receive a 400 response
    And the error message should mention password requirements

  Scenario: Duplicate email registration is rejected
    Given a user already exists with email "existing@example.com"
    When I submit a registration request with:
      | email      | existing@example.com |
      | password   | SecurePass123!       |
      | name       | Bob Wilson           |
      | alumni_id  | ALM20240002          |
    Then I should receive a 409 response
    And the error message should contain "already registered"

  Scenario: Notification email is sent after registration
    When I submit a registration request with:
      | email      | notify@example.com |
      | password   | SecurePass123!     |
      | name       | Carol Davis        |
      | alumni_id  | ALM20240003        |
    Then I should receive a 201 response
    And within 5 seconds, a welcome email should be sent to "notify@example.com"
    And an admin notification should be sent to "admin@nitte.com"

  Scenario: Pending user cannot login immediately
    Given a user is registered but not yet approved with:
      | email      | pending@example.com |
      | password   | SecurePass123!      |
      | name       | Dan Martinez        |
      | alumni_id  | ALM20240004         |
    When I attempt to login with:
      | email    | pending@example.com |
      | password | SecurePass123!      |
    Then I should receive a 401 response
    And the error message should indicate the account is not approved

  Scenario: User can login after admin approval
    Given a user is registered with:
      | email      | approved@example.com |
      | password   | SecurePass123!       |
      | name       | Eva Thompson         |
      | alumni_id  | ALM20240005          |
    And the user has been approved by admin
    When I attempt to login with:
      | email    | approved@example.com |
      | password | SecurePass123!       |
    Then I should receive a 200 response
    And I should receive valid access and refresh tokens
    And my user role should include "alumni"

  Scenario: Registration event is published to Kafka
    When I submit a registration request with:
      | email      | kafka@example.com |
      | password   | SecurePass123!    |
      | name       | Frank White       |
      | alumni_id  | ALM20240006       |
    Then I should receive a 201 response
    And a "user.registered" event should be published to Kafka
    And the event should contain the user's email and alumni ID
