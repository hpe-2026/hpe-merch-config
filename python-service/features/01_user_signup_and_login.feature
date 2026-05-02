Feature: User Signup and Login

  As a user
  I want to register and log in
  So that I can access my account and place orders

  # POSITIVE SCENARIOS

  Scenario: User can sign up with valid credentials
    Given the authentication service is running
    When I submit signup with email "newuser@test.com" password "password123" and name "John Doe"
    Then I should receive a success response
    And the user should be created in the system

  Scenario: User can log in with valid credentials
    Given the authentication service is running
    And a user exists with email "user@test.com" and password "password123"
    When I submit login with email "user@test.com" and password "password123"
    Then I should receive a success response
    And I should receive an access token

  # NEGATIVE SCENARIOS

  Scenario: User cannot sign up with invalid email
    Given the authentication service is running
    When I submit signup with email "notanemail" password "password123" and name "John Doe"
    Then I should receive a validation error
    And the user should not be created

  Scenario: User cannot sign up with short password
    Given the authentication service is running
    When I submit signup with email "user@test.com" password "short" and name "John Doe"
    Then I should receive a validation error
    And the user should not be created

  Scenario: User cannot log in with wrong password
    Given the authentication service is running
    And a user exists with email "user@test.com" and password "password123"
    When I submit login with email "user@test.com" and password "wrongpassword"
    Then I should receive an error response

  Scenario: User cannot log in with nonexistent email
    Given the authentication service is running
    When I submit login with email "nonexistent@test.com" and password "password123"
    Then I should receive an error response
