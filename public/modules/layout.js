import { $ } from './ui.js';

export function initLayout() {
  for (const section of document.querySelectorAll('.environment-info, .request-variable-info')) {
    section.addEventListener('toggle', () => section.querySelector('.info-label').textContent = section.open ? 'Hide info' : 'Show info');
  }
  // Move the existing editor so both views keep the same values, drafts, and handlers.
  const environmentWorkspace = $('environmentWorkspace');
  const environmentHome = environmentWorkspace.parentElement;
  const environmentNextSibling = environmentWorkspace.nextSibling;
  $('expandEnvironment').onclick = () => {
    $('environmentFullscreenContent').append(environmentWorkspace);
    document.body.classList.add('environment-modal-open');
    $('environmentFullscreen').showModal();
    $('closeEnvironmentFullscreen').focus();
  };
  $('closeEnvironmentFullscreen').onclick = () => $('environmentFullscreen').close();
  $('environmentFullscreen').addEventListener('close', () => {
    environmentHome.insertBefore(environmentWorkspace, environmentNextSibling);
    document.body.classList.remove('environment-modal-open');
    $('expandEnvironment').focus();
  });

}
