---
description: Instruction for rust api
applyTo: "**/*.rs, **/*.toml"
---

# Code Style

- keep names readable and consistent with the Rust community conventions.
- names shot and concise, but descriptive enough to convey their purpose.
- comments should be simple and clear, and should explain the purpose of the code rather than how it works.
- comments should not have non ascii characters, and no hard to type symbols

# API Design

- API should be designed with simplicity and ease of use in mind.
- API should be designed to be consistent with the Rust community conventions.
- API should be designed to be flexible and extensible, allowing for future changes and additions without breaking existing code.
- Routes should not contain implementation details, and should be focused on defining the API contract. Keep the implementation in the query layer or service layer.

# Tests

- Tests should be written for all public functions and methods.
- Tests should be organized in a way that makes it easy to find and run them.
- Tests should be written in a way that makes them easy to understand and maintain.

# Documentation

- Update the instructions file when you add new features or make significant changes to the codebase, to ensure that the documentation remains accurate and up-to-date.
- Documentation should be clear and concise
