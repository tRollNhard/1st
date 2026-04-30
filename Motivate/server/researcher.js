const TOPICS = [
  'overcoming fear and self-doubt',
  'building unstoppable confidence',
  'rising after failure',
  'the power of daily discipline',
  'unlocking your true potential',
  'turning pain into purpose',
  'never giving up on your dreams',
  'finding strength in hard times',
  'becoming the best version of yourself',
  'the mindset of champions',
  'taking the leap when you are scared',
  'why most people quit too early',
  'the compound effect of small daily wins',
  'silencing the voice that says you cannot',
  'what separates winners from everyone else',
];

function getTodaysTopic() {
  const dayIndex = Math.floor(Date.now() / 86400000) % TOPICS.length;
  return TOPICS[dayIndex];
}

module.exports = { getTodaysTopic };
