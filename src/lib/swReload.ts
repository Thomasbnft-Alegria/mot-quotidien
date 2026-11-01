// Gestion du rechargement quand un nouveau service worker prend le contrôle de la page.
// Au TOUT PREMIER chargement (aucun service worker avant), le service worker fait clients.claim() et déclenche
// un 'controllerchange' : recharger à ce moment-là efface un formulaire de connexion déjà rempli. On ignore donc
// ce premier changement ; on ne recharge que pour une VRAIE mise à jour (la page était déjà contrôlée).
export function createControllerChangeHandler(hadController: boolean, reload: () => void): () => void {
  let controlled = hadController;
  let refreshing = false;
  return () => {
    if (!controlled) {
      controlled = true; // première prise de contrôle : pas de rechargement
      return;
    }
    if (refreshing) return;
    refreshing = true;
    reload();
  };
}
