Feature: Admin User Verification and Approval Workflow
  As an admin user
  I want to review and approve/reject pending user registrations
  So that I can ensure only legitimate alumni users have access

  Background:
    Given the admin user is authenticated with role "admin"
    And the verification service is running

  Scenario: Admin can view list of unverified users
    Given there are 5 pending user registrations:
      | email                | name              | alumni_id |
      | user1@example.com    | User One          | ALM20240001 |
      | user2@example.com    | User Two          | ALM20240002 |
      | user3@example.com    | User Three        | ALM20240003 |
      | user4@example.com    | User Four         | ALM20240004 |
      | user5@example.com    | User Five         | ALM20240005 |
    When I request the list of unverified users
    Then I should receive a 200 response
    And the response should contain 5 users
    And all users should have status "pending"

  Scenario: Admin can paginate through unverified users
    Given there are 15 pending user registrations
    When I request unverified users with:
      | skip  | 10  |
      | limit | 5   |
    Then I should receive a 200 response
    And the response should contain 5 users
    And the total count should be 15

  Scenario: Admin can view detailed verification record
    Given a user is registered with:
      | email      | detail@example.com |
      | name       | Detail User        |
      | alumni_id  | ALM20240010        |
    When I request the verification details for this user
    Then I should receive a 200 response
    And the response should contain the user's registration timestamp
    And the response should contain the registration events history

  Scenario: Admin can approve a pending user
    Given a user is registered and pending approval with:
      | email      | approve@example.com |
      | name       | To Be Approved      |
      | alumni_id  | ALM20240011         |
    When I approve this user with reason "Alumni credentials verified"
    Then I should receive a 200 response
    And the user's status should change to "approved"
    And the approval timestamp should be recorded
    And an approval email should be sent to "approve@example.com"

  Scenario: Admin can reject a pending user
    Given a user is registered and pending approval with:
      | email      | reject@example.com |
      | name       | To Be Rejected     |
      | alumni_id  | INVALID001         |
    When I reject this user with reason "Alumni ID verification failed"
    Then I should receive a 200 response
    And the user's status should change to "rejected"
    And the rejection timestamp should be recorded
    And a rejection email should be sent to "reject@example.com"

  Scenario: Non-admin user cannot approve registrations
    Given I am logged in as a regular user
    And a user is pending approval
    When I attempt to approve the pending user
    Then I should receive a 403 response
    And the error message should indicate "Admin role required"

  Scenario: Cannot approve a user that's already been processed
    Given a user has already been approved
    When I attempt to approve the same user again
    Then I should receive a 410 response
    And the error message should indicate "User already processed"

  Scenario: Approval event is published to Kafka
    Given a user is registered and pending approval
    When I approve this user
    Then I should receive a 200 response
    And a "user.approved" event should be published to Kafka
    And the event should contain the approval reason and approver email

  Scenario: Rejection event is published to Kafka
    Given a user is registered and pending approval
    When I reject this user with reason "Does not meet alumni criteria"
    Then I should receive a 200 response
    And a "user.rejected" event should be published to Kafka
    And the event should contain the rejection reason

  Scenario: Admin can view verification statistics
    Given:
      | total approved | 10 |
      | total pending  | 5  |
      | total rejected | 2  |
    When I request the verification statistics
    Then I should receive a 200 response
    And the stats should show:
      | field    | value |
      | total    | 17    |
      | approved | 10    |
      | pending  | 5     |
      | rejected | 2     |

  Scenario: Approved user gains alumni role
    Given a user is approved
    When the user logs in
    Then the access token should contain the "alumni" role
    And the user should have access to alumni-exclusive features

  Scenario: Rejection reason is clearly communicated to user
    Given a user registration is rejected with reason "Duplicate identity detected"
    When the rejection email is sent to the user
    Then the email should clearly state the rejection reason
    And the email should provide support contact information
