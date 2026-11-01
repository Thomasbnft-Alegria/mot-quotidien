import { describe, it, expect, vi } from 'vitest';
import { createControllerChangeHandler } from '@/lib/swReload';

describe('createControllerChangeHandler', () => {
  it('première visite (aucun SW avant) : le premier controllerchange ne recharge PAS la page', () => {
    const reload = vi.fn();
    const handler = createControllerChangeHandler(false, reload);
    handler();
    expect(reload).not.toHaveBeenCalled();
  });

  it('mise à jour (page déjà contrôlée) : recharge une seule fois, même si l\'événement se répète', () => {
    const reload = vi.fn();
    const handler = createControllerChangeHandler(true, reload);
    handler();
    handler();
    handler();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('première visite puis mise à jour dans la même session : la 1re prise de contrôle est ignorée, la mise à jour recharge', () => {
    const reload = vi.fn();
    const handler = createControllerChangeHandler(false, reload);
    handler(); // claim initial
    expect(reload).not.toHaveBeenCalled();
    handler(); // nouvelle version du SW
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('deux handlers sont indépendants', () => {
    const r1 = vi.fn();
    const r2 = vi.fn();
    createControllerChangeHandler(true, r1)();
    createControllerChangeHandler(false, r2)();
    expect(r1).toHaveBeenCalledTimes(1);
    expect(r2).not.toHaveBeenCalled();
  });
});
