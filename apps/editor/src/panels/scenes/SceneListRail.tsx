import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { ProjectBundle } from "@mage2/schema";
import { AssetPreview } from "../../previews";
import { useEditorI18n } from "../../i18n/EditorI18nProvider";
import type { EditorTranslator } from "../../i18n/translate";
import { ChevronDownIcon, SceneToolIcon } from "./SceneEditorIcons";

type ProjectScene = ProjectBundle["scenes"]["items"][number];

interface SceneListRailProps {
  activeLocale: string;
  currentScene: ProjectScene;
  currentSceneId: string;
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  onClearHotspotSelection: () => void;
  onCreateScene: () => void;
  onDeleteScene: (sceneId: string) => void | Promise<void>;
  onSelectScene: (sceneId: string) => void;
}

interface LocationSwitcherOption {
  locationId: string;
  locationName: string;
  sceneCountLabel: string;
  isCurrent: boolean;
}

interface SceneSwitcherOption {
  sceneId: string;
  sceneName: string;
  locationName: string;
  isCurrent: boolean;
}

type SceneActionMenuItem = "rename" | "delete";
const identityEditorTranslator: EditorTranslator = (source, params = {}) =>
  source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  );

export function SceneListRail({
  activeLocale,
  currentScene,
  currentSceneId,
  project,
  mutateProject,
  onClearHotspotSelection,
  onCreateScene,
  onDeleteScene,
  onSelectScene
}: SceneListRailProps) {
  const { t } = useEditorI18n();
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const locationMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const locationMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sceneNameInputRef = useRef<HTMLInputElement>(null);
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  const sceneMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const sceneMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sceneActionMenuRef = useRef<HTMLDivElement>(null);
  const sceneActionMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const locationMenuId = useId();
  const sceneMenuId = useId();
  const sceneActionMenuBaseId = useId();
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const [openSceneActionMenuId, setOpenSceneActionMenuId] = useState<string>();

  const locationSwitcherOptions = resolveLocationSwitcherOptions(
    project.locations.items,
    project.scenes.items,
    currentScene.locationId,
    t
  );
  const currentLocationSwitcherIndex = Math.max(
    locationSwitcherOptions.findIndex((option) => option.locationId === currentScene.locationId),
    0
  );
  const sceneSwitcherOptions = resolveSceneSwitcherOptions(project.scenes.items, project.locations.items, currentSceneId, t);
  const currentSceneSwitcherIndex = Math.max(
    sceneSwitcherOptions.findIndex((option) => option.sceneId === currentSceneId),
    0
  );
  const sceneListItems = project.scenes.items.map((scene) => ({
    scene,
    locationName: project.locations.items.find((location) => location.id === scene.locationId)?.name ?? t("Unknown location"),
    asset: project.assets.assets.find((asset) => asset.id === scene.backgroundAssetId)
  }));

  useEffect(() => {
    setIsLocationMenuOpen(false);
  }, [currentScene.locationId]);

  useEffect(() => {
    if (!isLocationMenuOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      focusSceneMenuItem(currentLocationSwitcherIndex, locationMenuItemRefs.current, locationSwitcherOptions.length);
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !locationMenuRef.current?.contains(event.target)) {
        setIsLocationMenuOpen(false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || !locationMenuRef.current?.contains(event.target)) {
        setIsLocationMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsLocationMenuOpen(false);
      locationMenuTriggerRef.current?.focus();
    };

    const handleBlur = () => setIsLocationMenuOpen(false);

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleBlur);
    };
  }, [currentLocationSwitcherIndex, isLocationMenuOpen, locationSwitcherOptions.length]);

  useEffect(() => {
    setIsSceneMenuOpen(false);
    setOpenSceneActionMenuId(undefined);
  }, [currentSceneId]);

  useEffect(() => {
    if (!isSceneMenuOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      focusSceneMenuItem(currentSceneSwitcherIndex, sceneMenuItemRefs.current, sceneSwitcherOptions.length);
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !sceneMenuRef.current?.contains(event.target)) {
        setIsSceneMenuOpen(false);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || !sceneMenuRef.current?.contains(event.target)) {
        setIsSceneMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsSceneMenuOpen(false);
      sceneMenuTriggerRef.current?.focus();
    };

    const handleBlur = () => setIsSceneMenuOpen(false);

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleBlur);
    };
  }, [currentSceneSwitcherIndex, isSceneMenuOpen, sceneSwitcherOptions.length]);

  useEffect(() => {
    if (!openSceneActionMenuId) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      sceneActionMenuRef.current?.querySelector<HTMLButtonElement>("[data-scene-action-menu-item]")?.focus();
    });

    const isInsideActionMenu = (target: EventTarget | null) => {
      if (!(target instanceof Node)) {
        return false;
      }

      return Boolean(
        sceneActionMenuRef.current?.contains(target) ||
          sceneActionMenuTriggerRefs.current[openSceneActionMenuId]?.contains(target)
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideActionMenu(event.target)) {
        setOpenSceneActionMenuId(undefined);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isInsideActionMenu(event.target)) {
        setOpenSceneActionMenuId(undefined);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setOpenSceneActionMenuId(undefined);
      sceneActionMenuTriggerRefs.current[openSceneActionMenuId]?.focus();
    };

    const handleBlur = () => setOpenSceneActionMenuId(undefined);

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleBlur);
    };
  }, [openSceneActionMenuId]);

  function selectScene(sceneId: string, { focusName = true }: { focusName?: boolean } = {}) {
    setIsLocationMenuOpen(false);
    setIsSceneMenuOpen(false);
    setOpenSceneActionMenuId(undefined);

    if (sceneId !== currentSceneId) {
      onSelectScene(sceneId);
    }

    if (focusName) {
      window.requestAnimationFrame(() => {
        sceneNameInputRef.current?.focus();
        sceneNameInputRef.current?.select();
      });
    }
  }

  function handleSceneActionMenuTriggerKeyDown(sceneId: string, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsLocationMenuOpen(false);
      setIsSceneMenuOpen(false);
      setOpenSceneActionMenuId(sceneId);
      return;
    }

    if (event.key === "Escape" && openSceneActionMenuId === sceneId) {
      event.preventDefault();
      setOpenSceneActionMenuId(undefined);
    }
  }

  function handleSceneActionMenuItemKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const menuItems = Array.from(
      sceneActionMenuRef.current?.querySelectorAll<HTMLButtonElement>("[data-scene-action-menu-item]") ?? []
    );
    const currentIndex = menuItems.indexOf(event.currentTarget);
    const navigation = resolveSceneSwitcherMenuNavigation(event.key, currentIndex, menuItems.length);
    if (!navigation.handled) {
      return;
    }

    event.preventDefault();
    menuItems[navigation.nextIndex]?.focus();
  }

  function handleSceneMenuTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsLocationMenuOpen(false);
      setIsSceneMenuOpen(true);
      return;
    }

    if (event.key === "Escape" && isSceneMenuOpen) {
      event.preventDefault();
      setIsSceneMenuOpen(false);
    }
  }

  function handleSceneMenuItemKeyDown(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const navigation = resolveSceneSwitcherMenuNavigation(event.key, index, sceneSwitcherOptions.length);
    if (navigation.handled) {
      event.preventDefault();
      focusSceneMenuItem(navigation.nextIndex, sceneMenuItemRefs.current, sceneSwitcherOptions.length);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsSceneMenuOpen(false);
      sceneMenuTriggerRef.current?.focus();
    }
  }

  function handleLocationMenuSelect(locationId: string) {
    setIsLocationMenuOpen(false);
    setIsSceneMenuOpen(false);
    onClearHotspotSelection();

    if (locationId === currentScene.locationId) {
      window.requestAnimationFrame(() => locationMenuTriggerRef.current?.focus());
      return;
    }

    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
      if (!scene) {
        return;
      }

      const previousLocation = draft.locations.items.find((entry) => entry.id === scene.locationId);
      const nextLocation = draft.locations.items.find((entry) => entry.id === locationId);
      if (previousLocation) {
        previousLocation.sceneIds = previousLocation.sceneIds.filter((sceneId) => sceneId !== scene.id);
      }
      if (nextLocation && !nextLocation.sceneIds.includes(scene.id)) {
        nextLocation.sceneIds.push(scene.id);
      }
      scene.locationId = locationId;
    });

    window.requestAnimationFrame(() => locationMenuTriggerRef.current?.focus());
  }

  function handleLocationMenuTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClearHotspotSelection();
      setIsSceneMenuOpen(false);
      setIsLocationMenuOpen(true);
      return;
    }

    if (event.key === "Escape" && isLocationMenuOpen) {
      event.preventDefault();
      setIsLocationMenuOpen(false);
    }
  }

  function handleLocationMenuItemKeyDown(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const navigation = resolveSceneSwitcherMenuNavigation(event.key, index, locationSwitcherOptions.length);
    if (navigation.handled) {
      event.preventDefault();
      focusSceneMenuItem(navigation.nextIndex, locationMenuItemRefs.current, locationSwitcherOptions.length);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsLocationMenuOpen(false);
      locationMenuTriggerRef.current?.focus();
    }
  }

  return (
    <aside className="scenes-panel__side-controls" aria-label={t("Scene controls")}>
      <p className="scenes-panel__rail-heading">
        <span>{t("Scenes")}</span>
        <span className="scenes-panel__rail-heading-action" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </p>
      <div className="scenes-panel__selectors">
        <label title={t("Choose which world location owns the currently selected scene.")}>
          <span className="field-label--inset">{t("Location")}</span>
          <div className="scenes-panel__selector-row">
            <div className="scene-switcher" ref={locationMenuRef}>
              <button
                ref={locationMenuTriggerRef}
                type="button"
                className={
                  isLocationMenuOpen
                    ? "scene-switcher__control scene-switcher__control--button scene-switcher__control--open"
                    : "scene-switcher__control scene-switcher__control--button"
                }
                aria-haspopup="menu"
                aria-expanded={isLocationMenuOpen}
                aria-controls={locationMenuId}
                aria-label={t("Switch location")}
                onClick={() => {
                  onClearHotspotSelection();
                  setIsSceneMenuOpen(false);
                  setIsLocationMenuOpen((value) => !value);
                }}
                onKeyDown={handleLocationMenuTriggerKeyDown}
                onFocus={() => {
                  onClearHotspotSelection();
                  setIsSceneMenuOpen(false);
                }}
                title={t("Move this scene to a different location.")}
              >
                <span className="scene-switcher__value">
                  {locationSwitcherOptions[currentLocationSwitcherIndex]?.locationName ?? t("Unknown location")}
                </span>
                <span
                  className={isLocationMenuOpen ? "scene-switcher__trigger scene-switcher__trigger--open" : "scene-switcher__trigger"}
                  aria-hidden="true"
                >
                  <ChevronDownIcon />
                </span>
              </button>

              {isLocationMenuOpen ? (
                <div id={locationMenuId} className="scene-switcher__menu" role="menu" aria-label={t("Locations")}>
                  {locationSwitcherOptions.map((option, index) => (
                    <button
                      key={option.locationId}
                      ref={(element) => {
                        locationMenuItemRefs.current[index] = element;
                      }}
                      type="button"
                      className={option.isCurrent ? "scene-switcher__option scene-switcher__option--current" : "scene-switcher__option"}
                      role="menuitemradio"
                      aria-checked={option.isCurrent}
                      onClick={() => handleLocationMenuSelect(option.locationId)}
                      onKeyDown={(event) => handleLocationMenuItemKeyDown(index, event)}
                      title={t("Move this scene to {locationName}.", { locationName: option.locationName })}
                    >
                      <strong>{option.locationName}</strong>
                      <span>{option.sceneCountLabel}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="scenes-panel__selector-action"
              aria-label={t("Open location picker")}
              title={t("Open the location picker.")}
              onClick={() => setIsLocationMenuOpen((value) => !value)}
            >
              <SceneToolIcon kind="edit" />
            </button>
          </div>
        </label>
        <label title={t("Switch between scenes to edit their media, hotspots, and wiring.")}>
          <span className="field-label--inset">{t("Scene")}</span>
          <div className="scenes-panel__selector-row">
            <div className="scene-switcher" ref={sceneMenuRef}>
              <div className="scene-switcher__control">
                <input
                  ref={sceneNameInputRef}
                  className="scene-switcher__input"
                  value={currentScene.name}
                  aria-label={t("Scene name")}
                  onFocus={() => setIsSceneMenuOpen(false)}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                      if (scene) {
                        scene.name = event.target.value;
                      }
                    })
                  }
                />
                <button
                  ref={sceneMenuTriggerRef}
                  type="button"
                  className={isSceneMenuOpen ? "scene-switcher__trigger scene-switcher__trigger--open" : "scene-switcher__trigger"}
                  aria-haspopup="menu"
                  aria-expanded={isSceneMenuOpen}
                  aria-controls={sceneMenuId}
                  aria-label={t("Switch scenes")}
                  onClick={() => setIsSceneMenuOpen((value) => !value)}
                  onKeyDown={handleSceneMenuTriggerKeyDown}
                  title={t("Open the scene switcher.")}
                >
                  <ChevronDownIcon />
                </button>
              </div>

              {isSceneMenuOpen ? (
                <div id={sceneMenuId} className="scene-switcher__menu" role="menu" aria-label={t("Scenes")}>
                  {sceneSwitcherOptions.map((option, index) => (
                    <button
                      key={option.sceneId}
                      ref={(element) => {
                        sceneMenuItemRefs.current[index] = element;
                      }}
                      type="button"
                      className={option.isCurrent ? "scene-switcher__option scene-switcher__option--current" : "scene-switcher__option"}
                      role="menuitemradio"
                      aria-checked={option.isCurrent}
                      onClick={() => selectScene(option.sceneId)}
                      onKeyDown={(event) => handleSceneMenuItemKeyDown(index, event)}
                      title={t("Switch to {sceneName} in {locationName}.", {
                        sceneName: option.sceneName,
                        locationName: option.locationName
                      })}
                    >
                      <strong>{option.sceneName}</strong>
                      <span>{option.locationName}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="scenes-panel__selector-action"
              aria-label={t("Create scene")}
              title={t("Create a new scene in this location.")}
              onClick={() => {
                setOpenSceneActionMenuId(undefined);
                onCreateScene();
              }}
            >
              <SceneToolIcon kind="plus" />
            </button>
          </div>
        </label>
      </div>
      <div className="scenes-panel__scene-list" aria-label={t("Scenes in this project")}>
        {sceneListItems.map(({ scene, locationName, asset }) => {
          const isCurrentScene = scene.id === currentScene.id;
          const isActionMenuOpen = openSceneActionMenuId === scene.id;
          const actionMenuId = `${sceneActionMenuBaseId}-${scene.id}`;

          return (
            <div
              key={scene.id}
              className={
                isCurrentScene
                  ? "scenes-panel__scene-list-item scenes-panel__scene-list-item--active"
                  : "scenes-panel__scene-list-item"
              }
              aria-current={isCurrentScene ? "true" : undefined}
            >
              <button
                type="button"
                className="scenes-panel__scene-list-main"
                onClick={() => selectScene(scene.id, { focusName: false })}
                title={t("Open {sceneName} in {locationName}.", { sceneName: scene.name, locationName })}
              >
                <span className="scenes-panel__scene-thumb" aria-hidden="true">
                  <AssetPreview asset={asset} locale={activeLocale} interactive={false} allowSourceFallback preferPosterForImages />
                </span>
                <span className="scenes-panel__scene-list-label">
                  <strong>{scene.name}</strong>
                  <span>{locationName}</span>
                </span>
              </button>
              <div className="scenes-panel__scene-list-actions">
                <button
                  ref={(element) => {
                    sceneActionMenuTriggerRefs.current[scene.id] = element;
                  }}
                  type="button"
                  className={
                    isActionMenuOpen
                      ? "scenes-panel__scene-list-action scenes-panel__scene-list-action--open"
                      : "scenes-panel__scene-list-action"
                  }
                  aria-label={t("Open actions for {sceneName}", { sceneName: scene.name })}
                  aria-haspopup="menu"
                  aria-expanded={isActionMenuOpen}
                  aria-controls={isActionMenuOpen ? actionMenuId : undefined}
                  onClick={() => {
                    setIsLocationMenuOpen(false);
                    setIsSceneMenuOpen(false);
                    setOpenSceneActionMenuId(isActionMenuOpen ? undefined : scene.id);
                  }}
                  onKeyDown={(event) => handleSceneActionMenuTriggerKeyDown(scene.id, event)}
                  title={t("Open actions for {sceneName}.", { sceneName: scene.name })}
                >
                  <span className="scenes-panel__scene-list-kebab" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
                {isActionMenuOpen ? (
                  <div
                    ref={sceneActionMenuRef}
                    id={actionMenuId}
                    className="scenes-panel__scene-actions-menu"
                    role="menu"
                    aria-label={t("Actions for {sceneName}", { sceneName: scene.name })}
                  >
                    {resolveSceneActionMenuItems().map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={
                          item === "delete"
                            ? "scenes-panel__scene-actions-menu-item scenes-panel__scene-actions-menu-item--danger"
                            : "scenes-panel__scene-actions-menu-item"
                        }
                        role="menuitem"
                        data-scene-action-menu-item
                        onClick={() => {
                          if (item === "delete") {
                            setOpenSceneActionMenuId(undefined);
                            void onDeleteScene(scene.id);
                            return;
                          }

                          selectScene(scene.id, { focusName: true });
                        }}
                        onKeyDown={handleSceneActionMenuItemKeyDown}
                      >
                        {resolveSceneActionMenuItemLabel(item, t)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export function resolveLocationSwitcherOptions(
  locations: ProjectBundle["locations"]["items"],
  scenes: ProjectBundle["scenes"]["items"],
  currentLocationId?: string,
  t: EditorTranslator = identityEditorTranslator
): LocationSwitcherOption[] {
  const sceneCounts = new Map<string, number>();
  for (const scene of scenes) {
    sceneCounts.set(scene.locationId, (sceneCounts.get(scene.locationId) ?? 0) + 1);
  }

  return locations.map((location) => {
    const sceneCount = sceneCounts.get(location.id) ?? 0;
    return {
      locationId: location.id,
      locationName: location.name,
      sceneCountLabel: sceneCount === 1 ? t("{count} scene", { count: sceneCount }) : t("{count} scenes", { count: sceneCount }),
      isCurrent: location.id === currentLocationId
    };
  });
}

export function resolveSceneActionMenuItems(): SceneActionMenuItem[] {
  return ["rename", "delete"];
}

function resolveSceneActionMenuItemLabel(item: SceneActionMenuItem, t: EditorTranslator = identityEditorTranslator) {
  return item === "rename" ? t("Rename") : t("Delete");
}

export function resolveSceneSwitcherOptions(
  scenes: ProjectBundle["scenes"]["items"],
  locations: ProjectBundle["locations"]["items"],
  currentSceneId?: string,
  t: EditorTranslator = identityEditorTranslator
): SceneSwitcherOption[] {
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));

  return scenes.map((scene) => ({
    sceneId: scene.id,
    sceneName: scene.name,
    locationName: locationNames.get(scene.locationId) ?? t("Unknown location"),
    isCurrent: scene.id === currentSceneId
  }));
}

export function resolveSceneSwitcherMenuNavigation(key: string, currentIndex: number, itemCount: number) {
  if (itemCount <= 0) {
    return { handled: false, nextIndex: currentIndex };
  }

  switch (key) {
    case "ArrowDown":
      return { handled: true, nextIndex: (currentIndex + 1) % itemCount };
    case "ArrowUp":
      return { handled: true, nextIndex: (currentIndex - 1 + itemCount) % itemCount };
    case "Home":
      return { handled: true, nextIndex: 0 };
    case "End":
      return { handled: true, nextIndex: itemCount - 1 };
    default:
      return { handled: false, nextIndex: currentIndex };
  }
}

function focusSceneMenuItem(index: number, itemRefs: Array<HTMLButtonElement | null>, itemCount: number) {
  if (itemCount > 0) {
    itemRefs[(index + itemCount) % itemCount]?.focus();
  }
}
