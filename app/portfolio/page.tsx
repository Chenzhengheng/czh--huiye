import styles from "./portfolio.module.css";

const githubUrl = "https://github.com/Chenzhengheng/czh--huiye";

export default function PortfolioPage() {
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label="作品集导航">
      <a className={styles.brand} href="#top"><span>回</span>回页</a>
      <div><a href="#mechanism">重逢机制</a><a href="#validation">验证方式</a><a href={githubUrl}>GitHub</a></div>
    </nav>

    <section className={styles.hero} id="top">
      <div className={styles.kicker}>AI DIARY · PRODUCT CASE STUDY</div>
      <h1>你写下的自己，<br />不会在保存后必然沉没。</h1>
      <p>回页让一段过去的自我表达，在另一个时刻轻轻回到眼前。你可以沉默回味、说一句话、重新审视，也可以继续写；AI 在幕后寻找联系，但不替你定义那段过去。</p>
      <div className={styles.actions}><a href="#mechanism">理解跨时重逢</a><a className={styles.secondary} href={githubUrl}>查看代码仓库</a></div>
      <div className={styles.status}><span>当前阶段</span><strong>真实 case 校准</strong><small>用 good case 与 bad case 设计 Prompt 和时机规则；公开页面不展示私人原文</small></div>
    </section>

    <section className={styles.problem}>
      <div><span>01</span><h2>记录保存了文字，<br />却没有保存再次相遇的机会。</h2></div>
      <p>人的成长并不线性。新知识、新经历和新的自己会从别处进入生活；过去的念头、快乐和局促也可能多年后才重新有意义。回页不要求旧文字必须长成一篇新思考，只为它留下重新被看见、感受和回应的机会。</p>
    </section>

    <section className={styles.mechanism} id="mechanism">
      <header><span>02 · TWO SOURCES</span><h2>两种召回来源，<br />不预设固定比例。</h2></header>
      <div className={styles.modeGrid}>
        <article><div className={styles.formula}>过去 ↔ 过去 / 现在</div><h3>联系回响</h3><p>AI 从两篇或多篇原文中发现可核验的变化、联系或张力，先给出可修正的初步判断，再邀请用户回到当时的情境。</p><small>相关和正确只是候选条件；已经处在当前认知里的结论，可能“说得对，但没感觉”。</small></article>
        <article><div className={styles.formula}>一页旧文字 → 此刻</div><h3>回看回响</h3><p>即使没有明确关系，系统也可以在时间、许可、重复和冷却约束下，带回一页旧文字；不虚构它今天出现的命定理由。</p><small>过去可以是一小时前、昨天、一周前，也可以是一年前。没有合适候选时保持安静。</small></article>
      </div>
    </section>

    <section className={styles.layers}>
      <header><span>03 · EXPERIENCE</span><h2>原文先回来，<br />AI 的理解放在后面。</h2></header>
      <ol><li><b>留下</b><p>保存思考、感受、问题、自己的话与生活片段；不建设理论知识库。</p></li><li><b>找回</b><p>幕后发现候选，一次只准备一个，用无数字的小提示表达“有一页在等你”。</p></li><li><b>相遇</b><p>先读原句、节选和全文，再看 AI 初判；回应与反馈都可忽略。</p></li><li><b>连接</b><p>保存的短句或长文都是新 Entry，并与来源形成可见、可分支的连接。</p></li></ol>
    </section>

    <section className={styles.localFirst}>
      <div><span>04 · LOCAL FIRST</span><h2>原文留在用户拥有的本地文件夹。</h2><p>真实应用在本地运行。Entry 与 EchoRecord 分开保存；公开作品集不读取私人原文。目标数据模型保留呈现历史、可选反馈和回应连接，但完整 v2 迁移会在独立备份与校验后进行。</p></div>
      <pre>{`Entry（自我表达）
  ↓ 允许未来回响
EchoRecord（候选与证据）
  ↓ 某次错时呈现
EchoPresentation
  ↙       ↓        ↘
沉默     反馈      回应 Entry`}</pre>
    </section>

    <section className={styles.validation} id="validation">
      <header><span>05 · VALIDATION</span><h2>验证“有没有重逢感”，<br />不只验证“有没有继续写”。</h2></header>
      <div className={styles.validationGrid}><article><b>核心质量</b><h3>重逢感</h3><p>准确、惊喜、怀念、联系和回应欲都可能促成它，但都不单独等于它。沉默可能有价值；没有明确反馈时保持未知。</p></article><article><b>轻量校准</b><h3>三种可选反馈</h3><p>“有那种感觉”“说得对，但没感觉”“不太对”分别校准重逢质量、时机与解释。回应保存是更深结果，不是唯一成功。</p></article></div>
    </section>

    <footer className={styles.footer}><div><span className={styles.footerMark}>回</span><h2>回页 · AI Diary</h2><p>让写下的自己，在另一个时刻重新回来。</p></div><a href={githubUrl}>GitHub →</a></footer>
  </main>;
}
