# Data Model Principles

## Design goals

- support many tenants cleanly
- keep workflow history reproducible
- allow provider diversity without schema chaos
- keep analytics-friendly event history
- make configuration safe to evolve

## Core modeling rules

1. Model stable product concepts as relational tables.
2. Use `jsonb` only for provider-specific or rapidly changing extension fields.
3. Version any configuration that can affect runtime behavior.
4. Snapshot resolved config onto call execution records so history is immutable.
5. Prefer append-only event tables for operational history.

## Core entity groups

### Tenant and access

- tenants
- tenant_members
- workspaces
- environments

### Provider configuration

- provider_accounts
- provider_credentials
- provider_endpoints
- provider_capabilities

### Agent and workflow design

- agent_definitions
- agent_versions
- workflow_graphs
- workflow_nodes
- workflow_edges
- prompt_sets
- tool_bindings
- knowledge_bindings
- guardrail_policies

### Telephony configuration

- phone_numbers
- sip_trunks
- inbound_routes
- outbound_policies

### Runtime execution

- calls
- call_legs
- call_sessions
- call_events
- transcript_segments
- tool_call_events
- handoff_events
- extracted_variables
- guardrail_events

### Async and integration

- jobs
- job_runs
- webhooks
- webhook_deliveries
- eval_runs
- eval_results

## Multi-tenant principles

1. Every tenant-owned table should carry a tenant identifier.
2. All cross-tenant access should be explicit and rare.
3. Design for row-level security even if the first local build uses app-layer enforcement.
4. Never store provider secrets directly on workflow records.

## Partitioning candidates

When scale requires it, partition first by time for:

- call_events
- transcript_segments
- webhook_deliveries
- job_runs
- eval_results

## Configuration strategy

Store these as normalized fields:

- tenant id
- workflow version
- selected transport mode
- selected providers
- call status
- handoff type
- timestamps

Store these as `jsonb` extensions:

- provider tuning knobs
- vendor-specific VAD or endpointing options
- model-specific voice settings
- provider webhook payload fragments when raw retention is needed

## Seed and local bootstrap principles

- one command should create schema
- one command should seed a first admin workspace
- one command should provision local sample provider records and demo workflow data
