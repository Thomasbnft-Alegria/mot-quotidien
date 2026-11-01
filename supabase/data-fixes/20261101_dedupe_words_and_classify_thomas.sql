-- ============================================================================================================
-- RESERVOIR DE MOTS - PHASE 3b : (A) suppression des mots en double, (B) classement des mots de Thomas.
-- UN SEUL BLOC ATOMIQUE : si une verification echoue ou si dry = true, TOUT est annule (aucune ecriture).
--   dry = true  -> ESSAI : fait tout, puis leve volontairement une erreur "ESSAI ..." contenant le rapport => rien n'est enregistre.
--   dry = false -> APPLICATION REELLE.
-- Regles validees : copie conservee = celle qui a le plus de donnees utilisateur (puis display_order le plus bas) ;
-- >=3 bonnes reponses => maitrise (easy_count 3, mastered_at = maintenant, 1er controle a +1 mois) ;
-- sinon les N mieux assimiles (N = reservoir_size, 20 par defaut) restent actifs, le reste redevient "nouveau"
-- (pas de ligne word_reviews ET seen = false). Perimetre du classement : comptes dont l'email commence par 'thomas'.
-- ============================================================================================================
DO $mig$
DECLARE
  dry CONSTANT boolean := true;   -- <<< passer a false pour appliquer pour de vrai
  expected_groups CONSTANT int := 19;   -- nombre de groupes de doublons attendus (verifie a l'application reelle)
  target_email CONSTANT text := 'thomas+1@alegria.tech';   -- seul compte classe
  v_groups int; v_words_before int; v_words_after int;
  v_dups text; v_classes text; v_orphans int; v_bad int;
BEGIN
  SELECT count(*) INTO v_words_before FROM public.words;

  -- Garde-fou : au plus 2 copies par mot
  IF EXISTS (
    SELECT 1 FROM public.words
    GROUP BY regexp_replace(replace(replace(translate(lower(trim(word)), 'àâäéèêëîïôöùûüçÿñ', 'aaaeeeeiioouuucyn'), 'œ', 'oe'), 'æ', 'ae'), '[^a-z0-9]', '', 'g') HAVING count(*) > 2
  ) THEN
    RAISE EXCEPTION 'Un mot existe en plus de 2 copies : arret, a traiter a la main';
  END IF;

  -- Verrou : plus aucune ecriture concurrente sur ces tables pendant la migration
  LOCK TABLE public.words, public.user_progress, public.word_reviews, public.user_daily_word IN SHARE ROW EXCLUSIVE MODE;

  -- 0. Sauvegardes fraiches. REFUS si l'une existe deja : une 2e application reelle ecraserait la progression
  -- faite depuis, et une sauvegarde perimee serait reutilisee a tort.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'
             AND table_name IN ('words_backup_20261101','word_reviews_backup_20261101','user_progress_backup_20261101','user_daily_word_backup_20261101')) THEN
    RAISE EXCEPTION 'Une table *_backup_20261101 existe deja : migration deja appliquee ou sauvegarde perimee. Arret, rien n''a ete modifie.';
  END IF;
  CREATE TABLE public.words_backup_20261101           AS SELECT * FROM public.words;
  CREATE TABLE public.word_reviews_backup_20261101    AS SELECT * FROM public.word_reviews;
  CREATE TABLE public.user_progress_backup_20261101   AS SELECT * FROM public.user_progress;
  CREATE TABLE public.user_daily_word_backup_20261101 AS SELECT * FROM public.user_daily_word;
  ALTER TABLE public.words_backup_20261101           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.word_reviews_backup_20261101    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_progress_backup_20261101   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_daily_word_backup_20261101 ENABLE ROW LEVEL SECURITY;

  -- A. DOUBLONS ------------------------------------------------------------------------------------------
  CREATE TEMP TABLE _w ON COMMIT DROP AS
  SELECT w.id, w.word, w.display_order, w.created_at,
         regexp_replace(replace(replace(translate(lower(trim(w.word)), 'àâäéèêëîïôöùûüçÿñ', 'aaaeeeeiioouuucyn'), 'œ', 'oe'), 'æ', 'ae'), '[^a-z0-9]', '', 'g') AS norm,
         (SELECT count(*) FROM public.user_progress p WHERE p.word_id = w.id)
       + (SELECT count(*) FROM public.word_reviews  r WHERE r.word_id = w.id) AS refs
  FROM public.words w;

  CREATE TEMP TABLE _map ON COMMIT DROP AS
  SELECT id AS dup_id, canon_id, word FROM (
    SELECT id, word, norm,
           FIRST_VALUE(id) OVER (PARTITION BY norm ORDER BY refs DESC, display_order ASC NULLS LAST, created_at ASC, id) AS canon_id,
           COUNT(*) OVER (PARTITION BY norm) AS cnt
    FROM _w
  ) x WHERE cnt > 1 AND id <> canon_id;

  SELECT count(*), string_agg(word || ' (garde ' || left(canon_id::text, 8) || ', supprime ' || left(dup_id::text, 8) || ')', '; ' ORDER BY word)
    INTO v_groups, v_dups FROM _map;

  IF NOT dry AND v_groups <> expected_groups THEN
    RAISE EXCEPTION 'Nombre de groupes de doublons inattendu : % (attendu %). Arret, rien n''a ete modifie.', v_groups, expected_groups;
  END IF;

  -- user_progress : cumule la copie dans la ligne conservee quand elle existe, sinon re-pointe
  UPDATE public.user_progress c SET
    correct_count   = c.correct_count + d.correct_count,
    incorrect_count = c.incorrect_count + d.incorrect_count,
    seen            = c.seen OR d.seen,
    seen_date       = LEAST(c.seen_date, d.seen_date),
    last_reviewed   = GREATEST(c.last_reviewed, d.last_reviewed)
  FROM public.user_progress d JOIN _map m ON m.dup_id = d.word_id
  WHERE c.user_id = d.user_id AND c.word_id = m.canon_id;

  DELETE FROM public.user_progress d USING _map m
  WHERE d.word_id = m.dup_id
    AND EXISTS (SELECT 1 FROM public.user_progress c WHERE c.user_id = d.user_id AND c.word_id = m.canon_id);

  UPDATE public.user_progress d SET word_id = m.canon_id FROM _map m WHERE d.word_id = m.dup_id;

  -- word_reviews : si les deux lignes existent, on garde l'etat le plus avance (repetitions) sous l'id conserve
  UPDATE public.word_reviews c SET
    ease_factor = d.ease_factor, interval_days = d.interval_days, repetitions = d.repetitions,
    next_review_date = d.next_review_date, last_reviewed_at = d.last_reviewed_at,
    status = d.status, easy_count = d.easy_count, mastered_at = d.mastered_at,
    check_stage = d.check_stage, next_check_date = d.next_check_date
  FROM public.word_reviews d JOIN _map m ON m.dup_id = d.word_id
  -- etat le plus avance : mot maitrise d'abord, puis etape de controle, puis nombre de Facile, puis repetitions
  WHERE c.user_id = d.user_id AND c.word_id = m.canon_id
    AND ROW((d.status = 'mastered'), d.check_stage, d.easy_count, d.repetitions)
      > ROW((c.status = 'mastered'), c.check_stage, c.easy_count, c.repetitions);

  DELETE FROM public.word_reviews d USING _map m
  WHERE d.word_id = m.dup_id
    AND EXISTS (SELECT 1 FROM public.word_reviews c WHERE c.user_id = d.user_id AND c.word_id = m.canon_id);

  UPDATE public.word_reviews d SET word_id = m.canon_id FROM _map m WHERE d.word_id = m.dup_id;

  -- user_daily_word : re-pointe (cle primaire = user_id + date, aucun conflit possible)
  UPDATE public.user_daily_word d SET word_id = m.canon_id FROM _map m WHERE d.word_id = m.dup_id;

  -- Suppression des copies (plus rien ne les reference)
  DELETE FROM public.words w USING _map m WHERE w.id = m.dup_id;

  SELECT count(*) INTO v_words_after FROM public.words;
  IF v_words_before - v_words_after <> v_groups THEN
    RAISE EXCEPTION 'Incoherence : % mots supprimes pour % groupes', v_words_before - v_words_after, v_groups;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.words
    GROUP BY regexp_replace(replace(replace(translate(lower(trim(word)), 'àâäéèêëîïôöùûüçÿñ', 'aaaeeeeiioouuucyn'), 'œ', 'oe'), 'æ', 'ae'), '[^a-z0-9]', '', 'g') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Il reste des doublons apres nettoyage';
  END IF;

  -- B. CLASSEMENT DES MOTS DE THOMAS -------------------------------------------------------------------
  CREATE TEMP TABLE _cls ON COMMIT DROP AS
  WITH u AS (SELECT id FROM auth.users WHERE email = target_email),
  base AS (
    SELECT u.id AS user_id, w.id AS word_id, w.display_order,
           COALESCE(p.correct_count, 0) AS correct, COALESCE(p.incorrect_count, 0) AS incorrect,
           p.last_reviewed, COALESCE(s.reservoir_size, 20) AS n
    FROM u CROSS JOIN public.words w
    LEFT JOIN public.user_progress p ON p.user_id = u.id AND p.word_id = w.id
    LEFT JOIN public.word_reviews  r ON r.user_id = u.id AND r.word_id = w.id
    LEFT JOIN public.user_settings s ON s.user_id = u.id
    WHERE COALESCE(p.seen, false) OR r.word_id IS NOT NULL
  ),
  scored AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY user_id, (correct >= 3)
      ORDER BY (CASE WHEN correct + incorrect > 0 THEN correct::numeric / (correct + incorrect) ELSE 0 END) DESC,
               last_reviewed DESC NULLS LAST, display_order) AS rang
    FROM base
  )
  SELECT user_id, word_id, n,
         CASE WHEN correct >= 3 THEN 'maitrise' WHEN rang <= n THEN 'actif' ELSE 'nouveau' END AS classe
  FROM scored;

  -- Maitrises (insere la ligne si elle manquait)
  INSERT INTO public.word_reviews (user_id, word_id, next_review_date, status, easy_count, mastered_at, check_stage, next_check_date)
  SELECT user_id, word_id, current_date, 'mastered', 3, now(), 0, (current_date + interval '1 month')::date
  FROM _cls WHERE classe = 'maitrise'
  ON CONFLICT (user_id, word_id) DO UPDATE
  SET status = 'mastered', easy_count = 3, mastered_at = now(), check_stage = 0,
      next_check_date = (current_date + interval '1 month')::date
  WHERE public.word_reviews.status <> 'mastered';

  -- Actifs : statut actif, compteur Facile a zero (l'ancien systeme ne le notait pas)
  INSERT INTO public.word_reviews (user_id, word_id, next_review_date, status, easy_count, mastered_at, check_stage, next_check_date)
  SELECT user_id, word_id, current_date, 'active', 0, NULL, 0, NULL FROM _cls WHERE classe = 'actif'
  ON CONFLICT (user_id, word_id) DO UPDATE
  SET status = 'active', easy_count = 0, mastered_at = NULL, check_stage = 0, next_check_date = NULL
  WHERE public.word_reviews.status <> 'mastered';

  -- Redevenus neufs : plus de ligne de revision + "non vu" (les compteurs bonnes/mauvaises reponses restent)
  DELETE FROM public.word_reviews r USING _cls c
  WHERE c.classe = 'nouveau' AND r.user_id = c.user_id AND r.word_id = c.word_id;
  UPDATE public.user_progress p SET seen = false, seen_date = NULL
  FROM _cls c WHERE c.classe = 'nouveau' AND p.user_id = c.user_id AND p.word_id = c.word_id;

  -- Verifications finales (une seule suffit a tout annuler)
  SELECT count(*) INTO v_bad FROM (
    SELECT user_id FROM _cls WHERE classe = 'actif' GROUP BY user_id, n HAVING count(*) > n
  ) q;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Trop de mots actifs pour au moins un compte'; END IF;

  SELECT count(*) INTO v_bad FROM _cls c WHERE c.classe = 'nouveau'
    AND (EXISTS (SELECT 1 FROM public.word_reviews r WHERE r.user_id = c.user_id AND r.word_id = c.word_id)
      OR EXISTS (SELECT 1 FROM public.user_progress p WHERE p.user_id = c.user_id AND p.word_id = c.word_id AND p.seen));
  IF v_bad > 0 THEN RAISE EXCEPTION '% mots "nouveaux" ont encore une ligne de revision ou sont marques vus', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM _cls c WHERE c.classe = 'maitrise'
    AND NOT EXISTS (SELECT 1 FROM public.word_reviews r WHERE r.user_id = c.user_id AND r.word_id = c.word_id AND r.status = 'mastered' AND r.easy_count = 3);
  IF v_bad > 0 THEN RAISE EXCEPTION '% mots maitrises mal enregistres', v_bad; END IF;

  SELECT count(*) INTO v_orphans FROM public.word_reviews r WHERE NOT EXISTS (SELECT 1 FROM public.words w WHERE w.id = r.word_id);
  IF v_orphans > 0 THEN RAISE EXCEPTION '% lignes de revision pointent vers un mot inexistant', v_orphans; END IF;

  SELECT string_agg(e || ' : ' || classe || '=' || nb, ' | ' ORDER BY e, classe) INTO v_classes
  FROM (SELECT (SELECT email FROM auth.users WHERE id = c.user_id) AS e, c.classe, count(*) AS nb FROM _cls c GROUP BY 1, 2) q;

  IF dry THEN
    RAISE EXCEPTION 'ESSAI REUSSI (rien n''est enregistre) | mots avant=% apres=% | groupes de doublons=% (attendu % : %) | classement : % | detail doublons : %',
      v_words_before, v_words_after, v_groups, expected_groups, CASE WHEN v_groups = expected_groups THEN 'OK' ELSE 'ECART - NE PAS APPLIQUER' END, v_classes, v_dups;
  END IF;
END
$mig$;
