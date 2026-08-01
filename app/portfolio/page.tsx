import styles from "./portfolio.module.css";

const githubUrl = "https://github.com/Chenzhengheng/czh--huiye";

export default function PortfolioPage() {
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label="作品集导航">
      <a className={styles.brand} href="#top"><span>回</span>回页</a>
      <div><a href="#mechanism">回响机制</a><a href="#validation">验证</a><a href={githubUrl}>GitHub</a></div>
    </nav>

    <section className={styles.hero} id="top">
      <div className={styles.kicker}>AI DIARY · PRODUCT CASE STUDY</div>
      <h1>让过去的思考，<br />在值得的时候回到当下。</h1>
      <p>回页不是替用户总结人生的 AI。它保存用户确认过的思考，在过去与现在出现可核对的联系时轻轻发问，并把是否继续写交还给用户。</p>
      <div className={styles.actions}><a href="#mechanism">理解回响机制</a><a className={styles.secondary} href={githubUrl}>查看代码仓库</a></div>
      <div className={styles.status}><span>当前阶段</span><strong>回响 0.1</strong><small>使用 14 篇私人思考验证；作品集不展示私人原文</small></div>
    </section>

    <section className={styles.problem}>
      <div><span>01</span><h2>人们不缺保存工具，<br />缺的是重新进入过去的条件。</h2></div>
      <p>阅读笔记、工作复盘和临时想法不断积累，但新的内容很容易覆盖过去的犹豫、假设和未完成问题。回页关注的不是把内容“找回来”，而是过去的信息能否促成一篇新的思考。</p>
    </section>

    <section className={styles.mechanism} id="mechanism">
      <header><span>02 · TWO MODES</span><h2>两种思考延续</h2></header>
      <div className={styles.modeGrid}>
        <article><div className={styles.formula}>A + B → C</div><h3>关系延续</h3><p>当下的 B 与过去的 A 出现判断变化、冲突或未表达的联系。系统展示两边证据，邀请用户亲自写下 C。</p><small>系统只能说“似乎出现变化”，不能替用户断言已经改变。</small></article>
        <article><div className={styles.formula}>A + 现在 → B</div><h3>时间延续</h3><p>一段旧思考经过一定时间重新进入当下。系统交还当时的原句、时间和“为什么是现在”，等待用户重新判断。</p><small>不追求每日提醒；没有足够理由时保持安静。</small></article>
      </div>
    </section>

    <section className={styles.layers}>
      <header><span>03 · MEMORY MODEL</span><h2>不是知识图谱，<br />是被用户确认的连续性。</h2></header>
      <ol><li><b>原料层</b><p>用户明确保存的「我的思考」，AI 输出不会自动进入。</p></li><li><b>记忆层</b><p>候选联系、回响反馈，以及真正保存后形成的思考线。</p></li><li><b>应用层</b><p>关系回响、时间回响和用户主动发起的对话。</p></li></ol>
    </section>

    <section className={styles.localFirst}>
      <div><span>04 · LOCAL FIRST</span><h2>私人数据留在用户拥有的文件夹。</h2><p>真实应用在本地运行。每篇思考保存为可阅读的 Markdown 与结构化元数据；联系和反馈独立记录。写入失败不会覆盖上一份有效数据。</p></div>
      <pre>{`local-data/
├─ entries/<id>/content.md
├─ entries/<id>/record.json
├─ relations/
├─ associations/
└─ generations/`}</pre>
    </section>

    <section className={styles.validation} id="validation">
      <header><span>05 · VALIDATION</span><h2>用 good case 和 bad case，<br />而不是功能数量判断价值。</h2></header>
      <div className={styles.validationGrid}><article><b>成功信号</b><h3>continuation_saved</h3><p>只有用户沿着一次回响真正保存了新的思考，才算延续发生。</p></article><article><b>当前进行中</b><h3>案例验证尚未完成</h3><p>下一步将从真实思考中筛选关系延续与时间延续案例，公开内容只使用脱敏或重新编写的演示版本。</p></article></div>
    </section>

    <footer className={styles.footer}><div><span className={styles.footerMark}>回</span><h2>回页 · AI Diary</h2><p>独立产品定义、交互设计与实现。</p></div><a href={githubUrl}>GitHub ↗</a></footer>
  </main>;
}
