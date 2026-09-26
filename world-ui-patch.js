// Small compatibility layer for the VEXORA world menu.
document.addEventListener('DOMContentLoaded', () => {
  const save = document.getElementById('saveButton');
  const save2 = document.getElementById('saveButton2');
  if (save && save2) save2.addEventListener('click', () => save.click());
});
