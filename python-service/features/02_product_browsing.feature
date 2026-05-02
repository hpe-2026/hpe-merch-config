Feature: Product Browsing

  As a customer
  I want to browse and view product details
  So that I can decide what to purchase

  # POSITIVE SCENARIOS

  Scenario: Guest can view all products
    Given the product service is running
    When I request the products list
    Then I should receive a list of products
    And each product should have name, price, and description

  Scenario: Guest can view a specific product
    Given the product service is running
    And products exist in the system
    When I request product details by ID
    Then I should receive the product information
    And the product should have all required fields

  Scenario: Products can be filtered by category
    Given the product service is running
    When I request products with category filter
    Then I should receive filtered products

  # NEGATIVE SCENARIOS

  Scenario: Invalid product ID returns error
    Given the product service is running
    When I request product with invalid ID "invalid_id_format"
    Then I should receive a 400 error
    And the error should explain the issue

  Scenario: Nonexistent product returns 404
    Given the product service is running
    When I request product with ID "nonexistent_product_id"
    Then I should receive a 404 error
