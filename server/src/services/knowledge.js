const KNOWLEDGE_BASE = `
## 压力表检定专业知识库

### 一、检定周期
1. 一般压力表的检定周期为6个月
2. 新购置的压力表首次使用前必须进行检定
3. 修理后的压力表必须重新检定
4. 长期停用后重新使用前需要检定

### 二、检定不合格标准
1. 示值误差超过允许误差
2. 回程误差超过允许误差
3. 轻敲位移超过允许误差绝对值的1/2
4. 指针不能回到零点或零点误差超标
5. 外观有明显缺陷影响读数

### 三、选型要求
1. 压力表量程上限一般应为工作压力的1.5到3倍
2. 一般工况下可优先选择工作压力2倍量程
`

function getKnowledgeBase() {
  return KNOWLEDGE_BASE
}

function getRelevantKnowledge(question) {
  const text = String(question || '')
  const parts = []
  if (/周期|多久|频率|几个月/.test(text)) {
    parts.push('检定周期：一般压力表检定周期为6个月。')
  }
  if (/不合格|合格|标准/.test(text)) {
    parts.push('不合格标准：示值误差、回程误差、轻敲位移、零点误差或外观缺陷超标时判定为不合格。')
  }
  if (/选型|量程|选择/.test(text)) {
    parts.push('选型要求：量程上限一般应为工作压力的1.5到3倍。')
  }
  return parts.join('\n')
}

module.exports = {
  getKnowledgeBase,
  getRelevantKnowledge
}
