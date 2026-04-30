const KNOWLEDGE_BASE = `
Pressure gauge inspection basics:

1. A common inspection cycle is 6 months for general pressure gauges.
2. New gauges should be inspected before first use.
3. Repaired gauges should be re-inspected before going back into service.
4. Gauges used in safety critical scenarios should be tracked carefully for expiry.
5. Typical failure reasons include excessive indication error, return error, poor zero reset, or visible damage.
`

function getKnowledgeBase() {
  return KNOWLEDGE_BASE.trim()
}

function getRelevantKnowledge(question) {
  const text = String(question || '').toLowerCase()
  const parts = []

  if (/cycle|多久|周期|frequency/.test(text)) {
    parts.push('General pressure gauges are commonly inspected every 6 months.')
  }

  if (/qualified|不合格|合格|pass|fail/.test(text)) {
    parts.push('Typical failure reasons include excessive indication error, return error, poor zero reset, or visible damage.')
  }

  if (/selection|选型|range|量程/.test(text)) {
    parts.push('Working pressure is usually expected to stay in the middle portion of the selected range, not at the upper limit.')
  }

  if (/install|安装|location/.test(text)) {
    parts.push('Install gauges in a readable and maintainable location, and avoid strong vibration, corrosion, or excessive heat when possible.')
  }

  return parts.join('\n')
}

module.exports = {
  getKnowledgeBase,
  getRelevantKnowledge
}
