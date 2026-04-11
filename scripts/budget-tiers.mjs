/**
 * budget-tiers.mjs — Budget tier configuration.
 *
 * Import and use in SKILL.md orchestration to determine
 * which models, transitions, and compositing strategy to use.
 *
 * Usage:
 *   import { getTierConfig, estimateCost } from './budget-tiers.mjs';
 *   const config = getTierConfig('medium');
 */

export const TIERS = {
  low: {
    label: 'Low',
    videoModel: 'veo-3.1-fast',
    videoAudio: false,
    imageModel: 'gemini-2.0-flash',
    voiceModel: 'eleven_flash_v2_5',
    voiceCreditMultiplier: 0.5,
    transitions: 'moviepy',
    ambient: 'bundled',
    soundEffects: false,
    compositor: 'composite.py',
  },
  medium: {
    label: 'Medium',
    videoModel: 'veo-3.1-fast',
    videoAudio: true,
    imageModel: 'gemini-2.0-flash',
    voiceModel: 'eleven_v3',
    voiceCreditMultiplier: 1.0,
    transitions: 'mixed',
    ambient: 'mixed',
    soundEffects: 'selective',
    compositor: 'composite.py',
  },
  high: {
    label: 'High',
    videoModel: 'veo-3.1',
    videoAudio: true,
    imageModel: 'gemini-2.0-flash',
    voiceModel: 'eleven_v3',
    voiceCreditMultiplier: 1.0,
    transitions: 'generated',
    ambient: 'generated',
    soundEffects: true,
    compositor: 'composite-video-first.py',
  },
};

export function getTierConfig(tier) {
  const config = TIERS[tier.toLowerCase()];
  if (!config) throw new Error(`Unknown budget tier: ${tier}. Use: low, medium, high`);
  return config;
}

// Cost estimation per API call (approximate, USD)
const COST_PER_CALL = {
  'gemini-2.0-flash': { image: 0.001 },
  'veo-3.1-fast': { video: 0.020 },
  'veo-3.1': { video: 0.035 },
  'eleven_v3': { perChar: 0.00024 },
  'eleven_flash_v2_5': { perChar: 0.00012 },
  'elevenlabs-sfx': { perGeneration: 0.01 },
  'validation': { perCall: 0.001 },
};

export function estimateCost(tier, clipCount, avgCharsPerClip = 120) {
  const config = getTierConfig(tier);
  const usdToInr = parseFloat(process.env.USD_TO_INR || '84.5');

  const phases = {
    'Character Sheets': { calls: 2, costUsd: 2 * COST_PER_CALL[config.imageModel].image },
    'Keyframe Images': { calls: clipCount, costUsd: clipCount * COST_PER_CALL[config.imageModel].image },
    'Voiceover': {
      calls: 1,
      costUsd: clipCount * avgCharsPerClip * COST_PER_CALL[config.voiceModel].perChar,
    },
    'Video Clips': {
      calls: config.transitions === 'generated' ? clipCount * 2 : clipCount,
      costUsd: (config.transitions === 'generated' ? clipCount * 2 : clipCount) * COST_PER_CALL[config.videoModel].video,
    },
    'Ambient Audio': {
      calls: config.ambient === 'generated' ? 1 : 0,
      costUsd: config.ambient === 'generated' ? COST_PER_CALL['elevenlabs-sfx'].perGeneration : 0,
    },
    'Compositing': { calls: 0, costUsd: 0 },
    'Validation': { calls: clipCount + 1, costUsd: (clipCount + 1) * COST_PER_CALL.validation.perCall },
  };

  let totalUsd = 0;
  const breakdown = {};
  for (const [phase, data] of Object.entries(phases)) {
    totalUsd += data.costUsd;
    breakdown[phase] = {
      calls: data.calls,
      costUsd: data.costUsd.toFixed(4),
      costInr: (data.costUsd * usdToInr).toFixed(2),
    };
  }

  const timeEstimateSec = (clipCount * 10) + (phases['Video Clips'].calls * 80) + 30 + 120;
  const timeEstimateMin = Math.ceil(timeEstimateSec / 60);

  return {
    tier: config.label,
    clipCount,
    totalCostUsd: totalUsd.toFixed(4),
    totalCostInr: (totalUsd * usdToInr).toFixed(2),
    estimatedTimeMin: timeEstimateMin,
    breakdown,
  };
}
