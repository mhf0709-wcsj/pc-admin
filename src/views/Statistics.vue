<template>
  <div class="statistics-page">
    <div class="page-header">
      <h1 class="page-title">统计分析</h1>
      <p class="page-subtitle">这一页暂时沿用监管概览的数据视角，优先保留网页端可直接使用的风险统计。后续可以继续扩展辖区趋势、企业排行和删除留痕分析。</p>
    </div>

    <section class="coming-card card-shell">
      <div class="tag">Web Phase 1</div>
      <h3>网页端统计分析已预留</h3>
      <p>第一期先优先打通网页登录、监管概览、台账中心和企业管理，与小程序端数据互通。统计分析页后续建议继续扩展：</p>
      <ul>
        <li>辖区风险趋势</li>
        <li>重点企业排行</li>
        <li>删除留痕分析</li>
        <li>停用与报废压力表统计</li>
      </ul>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.coming-card {
  padding: 28px;

  .tag {
    width: fit-content;
    padding: 7px 12px;
    border-radius: 999px;
    background: rgba(30, 94, 255, 0.08);
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }

  h3 {
    margin-top: 18px;
    font-size: 24px;
    color: var(--text-main);
  }

  p {
    margin-top: 12px;
    color: var(--text-sub);
    line-height: 1.8;
  }

  ul {
    margin-top: 16px;
    padding-left: 18px;
    color: var(--text-main);
    line-height: 2;
  }
}
</style>
