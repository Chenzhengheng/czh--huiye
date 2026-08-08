import styles from "./portfolio.module.css";

const githubUrl = "https://github.com/Chenzhengheng/czh--huiye";

export default function PortfolioPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="作品集导航">
        <a className={styles.brand} href="#top">
          <span>回</span>回页
        </a>
        <div>
          <a href="#mechanism">核心机制</a>
          <a href="#validation">验证方式</a>
          <a href={githubUrl}>GitHub</a>
        </div>
      </nav>
      <section className={styles.hero} id="top">
        <div className={styles.kicker}>AI DIARY · PRODUCT CASE STUDY</div>
        <h1>
          让思考继续生长，
          <br />
          但把主导权留给人。
        </h1>
        <p>
          用户先把关于同一件事的记录放进「思考线」，AI
          再在线内显化已经隐约发生的延续、修正、分支与冲突。它不替用户建立人生图谱，只邀请用户再看一眼。
        </p>
        <div className={styles.actions}>
          <a href="#mechanism">理解思考线</a>
          <a className={styles.secondary} href={githubUrl}>
            查看代码仓库
          </a>
        </div>
        <div className={styles.status}>
          <span>当前阶段</span>
          <strong>第一版 · 案例校准</strong>
          <small>
            高频积累 good/bad case；正式体验保持克制，公开页面不读取私人原文
          </small>
        </div>
      </section>
      <section className={styles.problem}>
        <div>
          <span>01</span>
          <h2>
            变化已经写下，
            <br />
            却散落在不同的日记里。
          </h2>
        </div>
        <p>
          全局 AI
          搜索联系会把思维边界外包给模型，也容易得到“正确而无感”的总结。回页让人先选择哪些记录属于同一场思考，再让
          AI 把变化说清一点。
        </p>
      </section>
      <section className={styles.mechanism} id="mechanism">
        <header>
          <span>02 · USER-BOUNDED AI</span>
          <h2>
            人先归线，
            <br />
            AI 再观察。
          </h2>
        </header>
        <div className={styles.modeGrid}>
          <article>
            <div className={styles.formula}>Entry → ✦ 思考线</div>
            <h3>选择性归线</h3>
            <p>
              写下时、日记池编辑时、思考线详情中都能归线；一篇日记可进入多条线，也可以完全不归线。
            </p>
            <small>
              不强迫整理。未归线内容完整保留，未来只参与用户授权的低频复盘。
            </small>
          </article>
          <article>
            <div className={styles.formula}>同一条线 → AI 回响</div>
            <h3>线内显化</h3>
            <p>
              AI
              引用至少两篇不同时间的原文，指出可能的延续、修正、分支、冲突或未解决问题。
            </p>
            <small>
              先给证据，再给初判；用户可以看清、觉得早已知道、认为不对，或沉默离开。
            </small>
          </article>
        </div>
      </section>
      <section className={styles.layers}>
        <header>
          <span>03 · EXPERIENCE</span>
          <h2>
            原文是主角，
            <br />
            AI 只负责让变化更清楚。
          </h2>
        </header>
        <ol>
          <li>
            <b>留下</b>
            <p>保存思考、感受、问题与自己的话，不建设理论知识库。</p>
          </li>
          <li>
            <b>归线</b>
            <p>由用户建立主题边界，保留主线、交汇与未来分支的可能。</p>
          </li>
          <li>
            <b>看清</b>
            <p>先读原句、节选和全文，再判断 AI 的观察是否成立。</p>
          </li>
          <li>
            <b>生长</b>
            <p>回应可以现在写，也可以未来再写；它直接留在回响下方，不自动成为 Entry。</p>
          </li>
        </ol>
      </section>
      <section className={styles.localFirst}>
        <div>
          <span>04 · LOCAL FIRST</span>
          <h2>私人原文留在用户拥有的本地文件夹。</h2>
          <p>
            单篇和整线拥有独立 AI 权限；公开展示模式使用固定脱敏
            case，不读取真实日记。每次本地写入生成可校验的新数据代次，旧代次不自动删除。
          </p>
        </div>
        <pre>{`Entry（原文）\n  ↕ 用户多选归线\nThoughtLine（意图边界）\n  ↓ 双重权限允许\nEchoRecord（AI 观察）\n  ↙       ↓        ↘\n沉默   可选反馈   EchoReply`}</pre>
      </section>
      <section className={styles.validation} id="validation">
        <header>
          <span>05 · VALIDATION</span>
          <h2>
            先验证有没有看清，
            <br />
            再决定 AI 应该多主动。
          </h2>
        </header>
        <div className={styles.validationGrid}>
          <article>
            <b>核心质量</b>
            <h3>显化价值</h3>
            <p>
              AI
              是否把用户已经隐约记录、却尚未清楚说出的变化变得更可见。相关或正确都不自动等于有价值。
            </p>
          </article>
          <article>
            <b>轻量校准</b>
            <h3>三种可选反馈</h3>
            <p>
              “看清了一点”“我已经知道了”“不太对”分别校准新增价值、重复认知与解释偏差；沉默保持未知。
            </p>
          </article>
        </div>
      </section>
      <footer className={styles.footer}>
        <div>
          <span className={styles.footerMark}>回</span>
          <h2>回页 · AI Diary</h2>
          <p>让思考继续生长。</p>
        </div>
        <a href={githubUrl}>GitHub →</a>
      </footer>
    </main>
  );
}
