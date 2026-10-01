/* Roda no <head>, antes da pintura: marca que o JavaScript está ativo (o CSS usa .js para os efeitos de entrada)
 * e aplica o tema (escolha salva > preferência do sistema > escuro), para a página nunca piscar no tema errado. */
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var saved = null;
  try { saved = window.localStorage.getItem('gr-theme'); } catch (e) { /* armazenamento bloqueado */ }
  var light = false;
  try { light = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches); } catch (e) { /* sem matchMedia */ }
  d.setAttribute('data-theme', saved === 'light' || saved === 'dark' ? saved : light ? 'light' : 'dark');
})();
