import { $, actionMenu } from './ui.js';

export function initLayout() {
  for (const [id, label] of [['libraryActions', 'Library actions'], ['environmentActions', 'Environment actions'], ['environmentSettingsActions', 'Settings actions']]) {
    const slot = $(id); slot.replaceChildren(actionMenu(label, [...slot.children]));
  }
  for (const section of document.querySelectorAll('.environment-info, .request-variable-info')) {
    section.addEventListener('toggle', () => section.querySelector('.info-label').textContent = section.open ? 'Hide info' : 'Show info');
  }
  // Move the existing editor so both views keep the same values, drafts, and handlers.
  const environmentActions = $('environmentActions');
  const environmentActionsHome = environmentActions.parentElement;
  const environmentWorkspace = $('environmentWorkspace');
  const environmentHome = environmentWorkspace.parentElement;
  const environmentNextSibling = environmentWorkspace.nextSibling;
  $('expandEnvironment').onclick = () => {
    $('environmentFullscreenContent').append(environmentWorkspace);
    $('environmentFullscreenActions').append(environmentActions);
    document.body.classList.add('environment-modal-open');
    $('environmentFullscreen').showModal();
    $('closeEnvironmentFullscreen').focus();
  };
  $('closeEnvironmentFullscreen').onclick = () => $('environmentFullscreen').close();
  $('environmentFullscreen').addEventListener('close', () => {
    environmentHome.insertBefore(environmentWorkspace, environmentNextSibling);
    environmentActionsHome.append(environmentActions);
    document.body.classList.remove('environment-modal-open');
    $('expandEnvironment').focus();
  });

}
