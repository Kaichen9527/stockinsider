## ADDED Requirements

### Requirement: Discover Story Candidates from Public Sources
The system SHALL discover story candidates for TW stocks from public-first sources including company disclosures, conference materials, public research summaries, news, forums, and tracked KOL content.

#### Scenario: New story candidate is found
- **WHEN** discovery jobs detect a new or updated narrative tied to a TW symbol
- **THEN** the system stores a `story_candidate` with source references, story type, candidate symbols, and discovery timestamp

### Requirement: Classify Story Type and Link Related Symbols
The system SHALL normalize each story candidate into a supported story type and associate it with one or more related symbols, themes, and catalyst tags.

#### Scenario: Story candidate is normalized
- **WHEN** a story candidate enters the normalization stage
- **THEN** the system assigns a supported story type and links the candidate to related symbols, themes, and catalyst labels
