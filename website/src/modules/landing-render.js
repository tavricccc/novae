import { getCatalog, getLanguage } from './i18n.js';
import { initializeConfigConsole } from './config-console.js';

function renderFeatures(catalog) {
  const root = document.querySelector('[data-render="features"]');
  if (!root) return;
  root.innerHTML = catalog.features.cards
    .map(
      (card) => `<article class="capability-card">
      <div class="feature-icon"><i class="ti ti-${card.icon}" aria-hidden="true"></i></div>
      <h3>${card.title}</h3>
      <p>${card.body}</p>
    </article>`
    )
    .join('');
}

function renderWorkflow(catalog) {
  const steps = document.querySelector('[data-render="workflow-steps"]');
  if (steps) {
    steps.innerHTML = catalog.workflow.steps
      .map(
        (step) => `<li><span>${step.n}</span><div><strong>${step.title}</strong><p>${step.body}</p></div></li>`
      )
      .join('');
  }
  const statuses = document.querySelector('[data-render="workflow-statuses"]');
  if (statuses) {
    statuses.innerHTML = catalog.workflow.statuses
      .map((s) => `<div><strong>${s.title}</strong><span>${s.body}</span></div>`)
      .join('');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderConfig(catalog) {
  const points = document.querySelector('[data-render="config-points"]');
  if (points) {
    points.innerHTML = catalog.config.points.map((p) => `<li>${p}</li>`).join('');
  }
  const access = document.querySelector('[data-render="config-access"]');
  if (access) {
    access.innerHTML = catalog.config.access
      .map(
        (item) => `<article>
        <code>${item.code}</code>
        <strong>${item.title}</strong>
        <p>${item.body}</p>
      </article>`
      )
      .join('');
  }

  const consoleRoot = document.querySelector('[data-config-console]');
  if (!consoleRoot) return;
  const tabs = catalog.config.console.tabs;
  const snippets = catalog.config.console.snippets;
  const results = catalog.config.console.results;
  const tabBar = consoleRoot.querySelector('[data-render="config-tabs"]');
  const codeHost = consoleRoot.querySelector('[data-render="config-codes"]');
  const resultHost = consoleRoot.querySelector('[data-render="config-results"]');
  if (tabBar) {
    tabBar.innerHTML = tabs
      .map(
        (tab, index) =>
          `<button type="button" data-config-tab="${tab.key}" class="${index === 0 ? 'active' : ''}" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}">${tab.label}</button>`
      )
      .join('');
  }
  if (codeHost) {
    codeHost.innerHTML = tabs
      .map(
        (tab, index) =>
          `<pre data-config-code="${tab.key}" ${index === 0 ? '' : 'hidden'}><code>${escapeHtml(snippets[tab.key] || '')}</code></pre>`
      )
      .join('');
  }
  if (resultHost) {
    resultHost.innerHTML = tabs
      .map((tab, index) => {
        const r = results[tab.key] || { title: '', body: '' };
        return `<div class="console-result" data-config-result="${tab.key}" ${index === 0 ? '' : 'hidden'}>
          <span aria-hidden="true">●</span>
          <p><strong>${r.title}</strong><small>${r.body}</small></p>
        </div>`;
      })
      .join('');
  }
}

function renderArchitecture(catalog) {
  const nodes = document.querySelector('[data-render="arch-nodes"]');
  if (!nodes) return;
  nodes.innerHTML = catalog.architecture.nodes
    .map(
      (node) => `<article class="arch-node">
      <small>${node.small}</small>
      <strong>${node.title}</strong>
      <em>${node.em}</em>
    </article>`
    )
    .join('');
}

function renderPwa(catalog) {
  const root = document.querySelector('[data-render="pwa-cards"]');
  if (!root) return;
  root.innerHTML = catalog.pwa.cards
    .map(
      (card) => `<article>
      <span class="pwa-icon"><i class="ti ti-${card.icon}" aria-hidden="true"></i></span>
      <div>
        <h3>${card.title}</h3>
        <p>${card.body}</p>
      </div>
    </article>`
    )
    .join('');
}

function renderRoles(catalog) {
  const roles = document.querySelector('[data-render="roles"]');
  if (roles) {
    roles.innerHTML = catalog.roles.cards
      .map(
        (card) => `<article>
        <h3>${card.title}</h3>
        <ul>${card.items.map((item) => `<li>${item}</li>`).join('')}</ul>
      </article>`
      )
      .join('');
  }
  const more = document.querySelector('[data-render="more-features"]');
  if (more) {
    more.innerHTML = catalog.roles.more
      .map(
        (card) => `<article>
        <h3>${card.title}</h3>
        <p>${card.body}</p>
      </article>`
      )
      .join('');
  }
}

function renderFit(catalog) {
  const yes = document.querySelector('[data-render="fit-yes"]');
  if (yes) {
    yes.innerHTML = catalog.fit.yes.map((item) => `<li>${item}</li>`).join('');
  }
  const no = document.querySelector('[data-render="fit-no"]');
  if (no) {
    no.innerHTML = catalog.fit.no.map((item) => `<li>${item}</li>`).join('');
  }
}

function renderHeroFacts(catalog) {
  const root = document.querySelector('[data-render="hero-facts"]');
  if (!root) return;
  root.innerHTML = catalog.hero.facts
    .map((fact) => `<li><strong>${fact.label}</strong><span>${fact.text}</span></li>`)
    .join('');
}

function renderTrust(catalog) {
  const root = document.querySelector('[data-render="trust"]');
  if (!root) return;
  root.innerHTML = catalog.trust.map((item) => `<span>${item}</span>`).join('');
}

export function renderLandingLists() {
  const catalog = getCatalog(getLanguage());
  renderHeroFacts(catalog);
  renderTrust(catalog);
  renderFeatures(catalog);
  renderWorkflow(catalog);
  renderConfig(catalog);
  renderArchitecture(catalog);
  renderPwa(catalog);
  renderRoles(catalog);
  renderFit(catalog);
  initializeConfigConsole();
}

export function initializeLandingRender() {
  renderLandingLists();
  document.addEventListener('novae:language', () => {
    renderLandingLists();
  });
}
