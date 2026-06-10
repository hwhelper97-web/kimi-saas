/**
 * 📦 NAXTON SAAS PLAN DEFINITIONS
 * This is the source of truth for all feature gates and usage limits.
 */

const PLANS = {
  NEXA_CORE: {
    id: 'nexa_core',
    name: 'Nexa Core',
    price: 99,
    maxBusinesses: 1,
    maxStaff: 3,
    monthlyMinutes: 300,
    monthlyTokens: 50000,
    features: [
      'AI_CALL_ANSWERING',
      'RESERVATION_HANDLING',
      'BASIC_ORDER_TAKING',
      'FAQ_AUTOMATION'
    ],
    premium: false
  },
  NEXA_FLOW: {
    id: 'nexa_flow',
    name: 'Nexa Flow',
    price: 299,
    maxBusinesses: 5,
    maxStaff: 25,
    monthlyMinutes: 1200,
    monthlyTokens: 250000,
    features: [
      'AI_CALL_ANSWERING',
      'RESERVATION_HANDLING',
      'BASIC_ORDER_TAKING',
      'FAQ_AUTOMATION',
      'ADVANCED_AI_ORDERING',
      'API_ACCESS', // POS / API Integrations
      'SMS_CONFIRMATIONS',
      'AI_ROUTING_SYSTEM',
      'PRIORITY_SUPPORT'
    ],
    premium: true
  },
  NEXA_PRIME: {
    id: 'nexa_prime',
    name: 'Nexa Prime',
    price: 599,
    maxBusinesses: 20,
    maxStaff: 100,
    monthlyMinutes: 5000,
    monthlyTokens: 1000000,
    features: [
      'AI_CALL_ANSWERING',
      'RESERVATION_HANDLING',
      'BASIC_ORDER_TAKING',
      'FAQ_AUTOMATION',
      'ADVANCED_AI_ORDERING',
      'API_ACCESS',
      'SMS_CONFIRMATIONS',
      'AI_ROUTING_SYSTEM',
      'PRIORITY_SUPPORT',
      'MULTI_LOCATION_SUPPORT',
      'WHITE_LABEL_READY',
      'ADVANCED_ANALYTICS',
      'REALTIME_MONITORING',
      'DEDICATED_ONBOARDING'
    ],
    premium: true
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    maxBusinesses: 999,
    maxStaff: 999,
    monthlyMinutes: 99999,
    monthlyTokens: 9999999,
    features: [
      'UNLIMITED_SCALING',
      'DEDICATED_INFRASTRUCTURE',
      'CUSTOM_AI_WORKFLOWS',
      'SLA_SUPPORT',
      'SSO_SUPPORT',
      'MULTI_REGION_DEPLOYMENT',
      'DEDICATED_MANAGER'
    ],
    premium: true
  }
};

/**
 * Helper to check if a plan has a specific feature
 */
const hasFeature = (planId, featureKey) => {
  const plan = PLANS[planId.toUpperCase()];
  if (!plan) return false;
  if (planId.toUpperCase() === 'ENTERPRISE') return true; // Enterprise has everything
  return plan.features.includes(featureKey);
};

module.exports = { PLANS, hasFeature };
