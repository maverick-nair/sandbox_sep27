// LTI 1.3 delivery: the tool configuration an LMS administrator pastes in, platform registrations
// with validation, a test launch that plays the simulation as an LMS user would, and the exact
// Assignment and Grade Services score message the tool sends back to the gradebook.
// The signed launch (OIDC and JWT) is handled by the GenieKreator LTI service in production;
// everything an author configures here is what that service uses.

export const LTI_SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
];

const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

export function ltiToolConfig(def, { simId, version, toolUrl }) {
  const base = trimSlash(toolUrl || 'https://geniekreator.example/lti');
  return {
    title: def.meta.name,
    description: `${def.meta.name}: a GenieKreator leadership simulation.`,
    oidc_initiation_url: `${base}/login`,
    target_link_uri: `${base}/launch/${simId}`,
    public_jwk_url: `${base}/.well-known/jwks.json`,
    scopes: LTI_SCOPES,
    claims: ['iss', 'sub', 'name', 'given_name', 'family_name', 'email'],
    messages: [{ type: 'LtiResourceLinkRequest', target_link_uri: `${base}/launch/${simId}`, label: def.meta.name }, { type: 'LtiDeepLinkingRequest', target_link_uri: `${base}/deep-link`, label: 'Add a GenieKreator simulation' }],
    custom_fields: { sim_id: simId, version: String(version || 'latest'), pass_score: String(def.delivery?.passScore ?? 65) },
    extensions: [{ platform: 'canvas.instructure.com', settings: { placements: [{ placement: 'assignment_selection', message_type: 'LtiDeepLinkingRequest' }, { placement: 'link_selection', message_type: 'LtiResourceLinkRequest' }] } }],
  };
}

const isHttps = (u) => /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(String(u || '').trim());

export function validatePlatform(p) {
  const errors = {};
  if (!String(p.name || '').trim()) errors.name = 'Give the platform a name, e.g. Moodle production.';
  if (!isHttps(p.issuer)) errors.issuer = 'The issuer is the platform\'s https address, e.g. https://lms.example.edu.';
  if (!String(p.clientId || '').trim()) errors.clientId = 'The client ID comes from the platform when you register the tool.';
  if (!String(p.deploymentId || '').trim()) errors.deploymentId = 'Add the deployment ID from the platform.';
  for (const k of ['authUrl', 'tokenUrl', 'jwksUrl']) if (!isHttps(p[k])) errors[k] = 'Must be an https address.';
  return errors;
}

export const PLATFORM_PRESETS = {
  moodle: (host) => ({ issuer: `https://${host}`, authUrl: `https://${host}/mod/lti/auth.php`, tokenUrl: `https://${host}/mod/lti/token.php`, jwksUrl: `https://${host}/mod/lti/certs.php` }),
  canvas: () => ({ issuer: 'https://canvas.instructure.com', authUrl: 'https://sso.canvaslms.com/api/lti/authorize_redirect', tokenUrl: 'https://sso.canvaslms.com/login/oauth2/token', jwksUrl: 'https://sso.canvaslms.com/api/lti/security/jwks' }),
  blackboard: () => ({ issuer: 'https://blackboard.com', authUrl: 'https://developer.blackboard.com/api/v1/gateway/oidcauth', tokenUrl: 'https://developer.blackboard.com/api/v1/gateway/oauth2/jwttoken', jwksUrl: 'https://developer.blackboard.com/api/v1/management/applications/jwks.json' }),
};

// What the tool receives from a launch, reduced to what the simulation uses.
export function testLaunchContext(platform, { name, email, course } = {}) {
  return {
    platform: platform?.name || 'Test platform',
    issuer: platform?.issuer || 'https://lms.example.edu',
    deploymentId: platform?.deploymentId || 'test',
    userId: `lti-${Math.random().toString(36).slice(2, 10)}`,
    name: name || 'Test Learner',
    email: email || '',
    roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    context: { id: 'course-1', title: course || 'Leadership programme' },
    resourceLinkId: `rl-${Date.now().toString(36)}`,
    lineItem: `${trimSlash(platform?.issuer || 'https://lms.example.edu')}/api/lti/courses/1/line_items/1`,
  };
}

// The score message sent to the platform's line item when a learner finishes.
export function agsScore(rec, lti) {
  return {
    userId: lti.userId,
    scoreGiven: Math.round(rec.score),
    scoreMaximum: 100,
    comment: `Tier: ${rec.tier}. Conversions: ${rec.conversions}.`,
    activityProgress: rec.completed === false ? 'InProgress' : 'Completed',
    gradingProgress: 'FullyGraded',
    timestamp: new Date(rec.at || Date.now()).toISOString(),
    lineItem: lti.lineItem,
  };
}
