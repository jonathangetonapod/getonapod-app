import type { JoinRequest } from '@/services/accessRequests'

/*
 * Requests that were never a person asking to join.
 *
 * The deploy smoke check for request-workspace-access posts from reserved
 * addresses on our own domain: one "Deployment check" and a burst of numbered
 * "Rate limit check" probes. There is no is_test column (adding one needs a
 * migration, proposed in docs/manage-workspaces-discovery.md), so this
 * recognises that reserved pattern instead. A real person on @getonapod.com
 * is not caught: it takes the reserved name or the reserved mailbox.
 */
const TEST_NAME = /^(rate limit check|deployment check)\b/iu
const TEST_EMAIL = /^(burst-\d+|deploy-check)@getonapod\.com$/iu

export function isTestJoinRequest(request: Pick<JoinRequest, 'full_name' | 'email'>): boolean {
  return TEST_NAME.test(request.full_name.trim()) || TEST_EMAIL.test(request.email.trim())
}

/** Still needs a decision: waiting or contacted, and a real request. */
export function isOpenJoinRequest(request: JoinRequest): boolean {
  return (request.status === 'new' || request.status === 'contacted') && !isTestJoinRequest(request)
}
