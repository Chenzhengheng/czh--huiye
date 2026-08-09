import type { Metadata } from "next";
import styles from "./portfolio.module.css";
import heroStyles from "./portfolio-hero.module.css";

const githubUrl = "https://github.com/Chenzhengheng/czh--huiye";
const userFlowUrl =
  "https://raw.githubusercontent.com/Chenzhengheng/czh--huiye/main/docs/assets/huiye-user-path-bpmn.svg";

export const metadata: Metadata = {
  title: "回页｜让思考继续生长",
  description:
    "一个由用户划定思考边界、由 AI 显化思考变化的 0→1 AI 产品项目。",
};

const steps = [
  ["01", "留下", "保存思考、感受、疑问和自己真正说过的话。"],
  ["02", "归线", "用户决定哪些记录在讨论同一件事，AI 不越过边界。"],
  ["03", "看见", "AI 引用原文，显化延续、修正、分支、冲突或未解问题。"],
  ["04", "回应", "可以回一句，也可以沉默离开；成长不必发生在此刻。"],
];

export default function PortfolioPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="作品集导航">
        <a className={styles.brand} href="#top" aria-label="回到页首">
          <span>回</span>
          <b>回页</b>
        </a>
        <div className={styles.navLinks}>
          <a href="#product">产品机制</a>
          <a href="#evaluation">评测迭代</a>
          <a href="#delivery">工程交付</a>
          <a href={githubUrl} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
      </nav>

      <section className={`${styles.hero} ${heroStyles.hero}`} id="top">
        <div className={heroStyles.poster}>
          <img
            src="/og.png"
            width={1731}
            height={908}
            alt="回页，让思考继续生长。两篇笔记通过一条思考线重新连接。"
          />
        </div>

        <div className={heroStyles.intro}>
          <div>
            <p className={styles.eyebrow}>AI PRODUCT · 0 → 1 CASE STUDY</p>
            <p className={`${styles.lead} ${heroStyles.lead}`}>
              我从 0 到 1 独立负责回页的产品定位、交互设计、Agent Prompt
              与评测体系，并借助 AI 编程工具 Codex 完成工程交付。
            </p>
          </div>
          <div className={`${styles.actions} ${heroStyles.actions}`}>
            <a className={styles.primaryAction} href="/portfolio/demo">
              体验回页 <span>→</span>
            </a>
            <a className={styles.textAction} href="/portfolio/demo/evaluation">
              查看完整评测
            </a>
          </div>
        </div>

        <dl className={heroStyles.stats} aria-label="项目摘要">
          <div><dt>10</dt><dd>真实评测 Case</dd></div>
          <div><dt>3</dt><dd>Prompt 版本</dd></div>
          <div><dt>33+</dt><dd>自动化测试</dd></div>
        </dl>
      </section>

      <section className={styles.thesis} id="story">
        <p className={styles.sectionIndex}>01 · WHY</p>
        <h2>过去的记录没有消失，<br />只是很少再被真正看见。</h2>
        <div className={styles.thesisBody}>
          <p>
            在茫茫笔记中让 AI 自由寻找联系，本质上仍是把思考边界外包给模型。它容易找到相关性，却不一定找到用户真正关心的变化。
          </p>
          <p>
            回页选择了另一条路：人先隐约记录、主动划线，AI 再把这些记录中已经发生的延续、修正和矛盾说清一点。AI 是观察者，不是思想管理员。
          </p>
        </div>
      </section>

      <section className={styles.product} id="product">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionIndex}>02 · PRODUCT</p>
            <h2>人先归线，AI 再观察。</h2>
          </div>
          <p>
            ThoughtLine 是用户给出的意图边界；Echo 是 AI 在边界内基于原文证据形成的暂时看见。
          </p>
        </header>

        <div className={styles.mechanismGrid}>
          <article className={styles.mechanismCard}>
            <span className={styles.cardNumber}>A</span>
            <div className={styles.miniEntry}>
              <small>8 月 2 日</small>
              <strong>我还没有想清这件事……</strong>
              <span>普通标签</span><i>✦ 思考线</i>
            </div>
            <h3>选择性归线</h3>
            <p>一篇 Entry 可以进入零条或多条 ThoughtLine。用户只做初步判断，不被迫整理完整人生。</p>
          </article>

          <article className={styles.mechanismCard}>
            <span className={styles.cardNumber}>B</span>
            <div className={styles.lineSketch} aria-hidden="true">
              <i />
              <span>过去的一页</span>
              <i />
              <b>AI 看见一处变化</b>
              <i />
              <span>现在的一页</span>
            </div>
            <h3>线内显化</h3>
            <p>AI 优先在一条主思考线中选择最小充分证据；没有真实关系时，保持沉默。</p>
          </article>

          <article className={`${styles.mechanismCard} ${styles.darkCard}`}>
            <span className={styles.cardNumber}>C</span>
            <blockquote>
              “你似乎不再只问外部会发生什么，而开始辨认自己能够改变什么。”
            </blockquote>
            <small>AI 暂时看见 · 由你判断</small>
            <h3>可修正的观察</h3>
            <p>先给逐字证据，再给解释性初判。可看清、可说不对，也可以什么都不做。</p>
          </article>
        </div>

        <ol className={styles.steps}>
          {steps.map(([number, title, body]) => (
            <li key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.evaluation} id="evaluation">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionIndex}>03 · EVALUATION</p>
            <h2>不是“有没有联系”，<br />而是“有没有看清一点”。</h2>
          </div>
          <p>
            回响以关系成立度、显化增量和重逢感三项维度评测。good / bad 始终由人判断，不由分数自动决定。
          </p>
        </header>

        <div className={styles.iteration}>
          <article className={styles.caseCard}>
            <div className={styles.caseMeta}>
              <span>代表性 BAD CASE</span>
              <b>Prompt v0.1</b>
            </div>
            <h3>关系正确，却没有新增看见</h3>
            <p>
              仅凭主题或关键词相似建立联系，会得到“正确而无感”的总结。问题不在措辞，而在候选关系没有通过显化增量门槛。
            </p>
            <div className={styles.scoreRow}>
              <span>关系成立 <b>高</b></span>
              <span>显化增量 <b>低</b></span>
              <span>重逢感 <b>低</b></span>
            </div>
          </article>

          <div className={styles.promptShift}>
            <span>归因</span>
            <i>→</i>
            <span>修改搜索与沉默规则</span>
            <i>→</i>
            <span>再评测</span>
          </div>

          <article className={`${styles.caseCard} ${styles.goodCase}`}>
            <div className={styles.caseMeta}>
              <span>CASE 10 · GOOD</span>
              <b>Prompt v0.3</b>
            </div>
            <h3>从两次记录中显化出真正的判断变化</h3>
            <p>
              v0.3 先确定主 ThoughtLine，再选择最小充分证据，并允许 SilentDecision。最终得到一条三项维度均为“高”的新 good case。
            </p>
            <div className={styles.scoreRow}>
              <span>关系成立 <b>高</b></span>
              <span>显化增量 <b>高</b></span>
              <span>重逢感 <b>高</b></span>
            </div>
          </article>
        </div>
        <div className={styles.evaluationLink}>
          <p>这里展示迭代结论。10 个完整 Case、评测标准和 Prompt 版本均保留在评测工作簿中。</p>
          <a href="/portfolio/demo/evaluation">查看完整评测 →</a>
        </div>
      </section>

      <section className={styles.flow} id="flow">
        <div className={styles.flowIntro}>
          <p className={styles.sectionIndex}>04 · USER FLOW</p>
          <h2>从写下一页，到再次遇见。</h2>
          <p>完整用户流程覆盖写下、归线、AI 观察、低打扰出现、回应与评测。点击图面可查看完整尺寸。</p>
        </div>
        <a className={styles.flowCanvas} href={userFlowUrl} target="_blank" rel="noreferrer">
          {/* The canonical editable source remains docs/assets/huiye-user-path-bpmn.svg. */}
          <img src={userFlowUrl} alt="回页完整用户流程图" />
          <span>打开完整流程图 ↗</span>
        </a>
      </section>

      <section className={styles.delivery} id="delivery">
        <header>
          <p className={styles.sectionIndex}>05 · DELIVERY</p>
          <h2>产品判断，最后要落到<br />可运行、可验证、可追踪。</h2>
        </header>
        <div className={styles.deliveryGrid}>
          <article><b>Local-first</b><p>私人原文保存在用户拥有的本地文件夹；公开模式永不读取私人 Entry。</p></article>
          <article><b>Agent Prompt</b><p>Prompt v0.1–v0.3 完整留档，Case 记录其生成版本与用户原话。</p></article>
          <article><b>Evaluation</b><p>10 个 Case、3 项维度、good/bad 判断和归因在同一工作簿中追踪。</p></article>
          <article><b>Engineering</b><p>TypeScript、React、Cloudflare 与自动化测试共同保证公开交付。</p></article>
        </div>
        <a className={styles.repoBanner} href={githubUrl} target="_blank" rel="noreferrer">
          <span>完整代码、产品文档、数据结构与流程图</span>
          <strong>github.com/Chenzhengheng/czh--huiye ↗</strong>
        </a>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionIndex}>脱敏交互演示 · 无账户 · 不保存访客内容</p>
        <h2>亲自走一遍，<br />看 AI 如何轻轻说出一处变化。</h2>
        <a href="/portfolio/demo">进入回页演示 <span>→</span></a>
      </section>

      <footer className={styles.footer}>
        <div><span>回</span><b>回页 · 让思考继续生长</b></div>
        <p>0 → 1 产品定位、交互、Agent Prompt、评测与工程交付（Codex）</p>
        <a href={githubUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>
    </main>
  );
}
