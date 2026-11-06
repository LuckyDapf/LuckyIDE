/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IEncryptionService } from '../../../../platform/encryption/common/encryptionService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IMetricsService } from './metricsService.js';
import { defaultProviderSettings, getModelCapabilities, ModelOverrides } from './modelCapabilities.js';
import { isFreeModelSelection } from './freeModelsMode.js';
import { SETTINGS_BACKUP_STORAGE_KEYS, SETTINGS_CORRUPT_STORAGE_KEY, SETTINGS_STORAGE_KEY, LEGACY_SETTINGS_STORAGE_KEYS } from './storageKeys.js';
import { defaultSettingsOfProvider, FeatureName, ProviderName, ModelSelectionOfFeature, SettingsOfProvider, SettingName, providerNames, ModelSelection, modelSelectionsEqual, featureNames, VoidStatefulModelInfo, GlobalSettings, GlobalSettingName, defaultGlobalSettings, ModelSelectionOptions, OptionsOfModelSelection, ChatMode, OverridesOfModel, defaultOverridesOfModel, MCPUserStateOfName as MCPUserStateOfName, MCPUserState } from './voidSettingsTypes.js';


// name is the name in the dropdown
export type ModelOption = { name: string, selection: ModelSelection }



type SetSettingOfProviderFn = <S extends SettingName>(
	providerName: ProviderName,
	settingName: S,
	newVal: SettingsOfProvider[ProviderName][S extends keyof SettingsOfProvider[ProviderName] ? S : never],
) => Promise<void>;

type SetModelSelectionOfFeatureFn = <K extends FeatureName>(
	featureName: K,
	newVal: ModelSelectionOfFeature[K],
) => Promise<void>;

type SetGlobalSettingFn = <T extends GlobalSettingName>(settingName: T, newVal: GlobalSettings[T]) => void;

type SetOptionsOfModelSelection = (featureName: FeatureName, providerName: ProviderName, modelName: string, newVal: Partial<ModelSelectionOptions>) => void


export type VoidSettingsState = {
	readonly settingsOfProvider: SettingsOfProvider; // optionsOfProvider
	readonly modelSelectionOfFeature: ModelSelectionOfFeature; // stateOfFeature
	readonly optionsOfModelSelection: OptionsOfModelSelection;
	readonly overridesOfModel: OverridesOfModel;
	readonly globalSettings: GlobalSettings;
	/** Режим «только бесплатные модели»: платные скрываются и не используются. */
	readonly freeModelsOnly: boolean;
	/** Текущая модель выбрана автоматически (предыдущая не ответила), а не пользователем. */
	readonly freeModelsAutoSwitched: boolean;
	readonly mcpUserStateOfName: MCPUserStateOfName; // user-controlled state of MCP servers

	readonly _modelOptions: ModelOption[] // computed based on the two above items
}

// type RealVoidSettings = Exclude<keyof VoidSettingsState, '_modelOptions'>
// type EventProp<T extends RealVoidSettings = RealVoidSettings> = T extends 'globalSettings' ? [T, keyof VoidSettingsState[T]] : T | 'all'


export interface IVoidSettingsService {
	readonly _serviceBrand: undefined;
	readonly state: VoidSettingsState; // in order to play nicely with react, you should immutably change state
	readonly waitForInitState: Promise<void>;

	onDidChangeState: Event<void>;

	setSettingOfProvider: SetSettingOfProviderFn;
	setModelSelectionOfFeature: SetModelSelectionOfFeatureFn;
	setOptionsOfModelSelection: SetOptionsOfModelSelection;
	setGlobalSetting: SetGlobalSettingFn;
	/** Включает/выключает режим «только бесплатные модели». */
	setFreeModelsOnly(newVal: boolean): Promise<void>;
	/** Запоминает модель, которая реально ответила (авто-переключение). */
	setModelSelectionOfFeatureAuto(featureName: FeatureName, newVal: ModelSelection): Promise<void>;
	// setMCPServerStates: (newStates: MCPServerStates) => Promise<void>;

	// setting to undefined CLEARS it, unlike others:
	setOverridesOfModel(providerName: ProviderName, modelName: string, overrides: Partial<ModelOverrides> | undefined): Promise<void>;

	dangerousSetState(newState: VoidSettingsState): Promise<void>;
	resetState(): Promise<void>;

	setAutodetectedModels(providerName: ProviderName, modelNames: string[], logging: object): void;
	/** Полная синхронизация списка моделей с провайдером (устаревшие удаляются). */
	setSyncedModels(providerName: ProviderName, modelNames: string[]): void;
	toggleModelHidden(providerName: ProviderName, modelName: string): void;
	addModel(providerName: ProviderName, modelName: string): void;
	deleteModel(providerName: ProviderName, modelName: string): boolean;

	addMCPUserStateOfNames(userStateOfName: MCPUserStateOfName): Promise<void>;
	removeMCPUserStateOfNames(serverNames: string[]): Promise<void>;
	setMCPServerState(serverName: string, state: MCPUserState): Promise<void>;
}




/**
 * Добавляет к списку моделей только те, которых в нём ещё нет.
 *
 * Раньше здесь стояла замена «все модели такого-то типа выкидываем и ставим новый
 * список» — из-за неё при каждом старте терялись модели, полученные из API, и
 * выбранная пользователем модель откатывалась на первую доступную (обычно free).
 * Теперь список только пополняется: ничего пользовательского не пропадает.
 */
const _modelsWithAddedNewModels = (options: { existingModels: VoidStatefulModelInfo[], models: string[], type: 'autodetected' | 'default' }) => {
	const { existingModels, models, type } = options

	const existingNames = new Set(existingModels.map(m => m.modelName))
	const addedModels = models
		.filter(modelName => !existingNames.has(modelName))
		.map(modelName => ({ modelName, type, isHidden: false } as VoidStatefulModelInfo))

	if (!addedModels.length) return existingModels
	return [...existingModels, ...addedModels]
}


export const modelFilterOfFeatureName: {
	[featureName in FeatureName]: {
		filter: (
			o: ModelSelection,
			opts: { chatMode: ChatMode, overridesOfModel: OverridesOfModel }
		) => boolean;
		emptyMessage: null | { message: string, priority: 'always' | 'fallback' }
	} } = {
	'Autocomplete': { filter: (o, opts) => getModelCapabilities(o.providerName, o.modelName, opts.overridesOfModel).supportsFIM, emptyMessage: { message: 'No models support FIM', priority: 'always' } },
	'Chat': { filter: o => true, emptyMessage: null, },
	'Ctrl+K': { filter: o => true, emptyMessage: null, },
	'Apply': { filter: o => true, emptyMessage: null, },
	'SCM': { filter: o => true, emptyMessage: null, },
}


const _stateWithMergedDefaultModels = (state: VoidSettingsState): VoidSettingsState => {
	let newSettingsOfProvider = state.settingsOfProvider
	let didChange = false

	// добавляем недостающие встроенные модели, НЕ трогая уже сохранённые
	for (const providerName of providerNames) {
		const settingsAtProvider = newSettingsOfProvider[providerName]
		if (!settingsAtProvider) continue

		const defaultModels = defaultSettingsOfProvider[providerName]?.models ?? []
		const currentModels = settingsAtProvider.models ?? []
		const defaultModelNames = defaultModels.map(m => m.modelName)
		const newModels = _modelsWithAddedNewModels({ existingModels: currentModels, models: defaultModelNames, type: 'default' })
		if (newModels === currentModels) continue

		didChange = true
		newSettingsOfProvider = {
			...newSettingsOfProvider,
			[providerName]: {
				...settingsAtProvider,
				models: newModels,
			},
		}
	}

	if (!didChange) return state
	return {
		...state,
		settingsOfProvider: newSettingsOfProvider,
	}
}

const _validatedModelState = (state: Omit<VoidSettingsState, '_modelOptions'>): VoidSettingsState => {

	let newSettingsOfProvider = state.settingsOfProvider

	// recompute _didFillInProviderSettings
	for (const providerName of providerNames) {
		const settingsAtProvider = newSettingsOfProvider[providerName]

		const didFillInProviderSettings = Object.keys(defaultProviderSettings[providerName]).every(key => !!settingsAtProvider[key as keyof typeof settingsAtProvider])

		if (didFillInProviderSettings === settingsAtProvider._didFillInProviderSettings) continue

		newSettingsOfProvider = {
			...newSettingsOfProvider,
			[providerName]: {
				...settingsAtProvider,
				_didFillInProviderSettings: didFillInProviderSettings,
			},
		}
	}

	// update model options
	let newModelOptions: ModelOption[] = []
	for (const providerName of providerNames) {
		const providerTitle = providerName // displayInfoOfProviderName(providerName).title.toLowerCase() // looks better lowercase, best practice to not use raw providerName
		if (!newSettingsOfProvider[providerName]._didFillInProviderSettings) continue // if disabled, don't display model options
		for (const { modelName, isHidden } of newSettingsOfProvider[providerName].models) {
			if (isHidden) continue
			// режим «только бесплатные»: платные модели не попадают в выбор
			if (state.freeModelsOnly && !isFreeModelSelection(providerName, modelName)) continue
			newModelOptions.push({ name: `${modelName} (${providerTitle})`, selection: { providerName, modelName } })
		}
	}

	// now that model options are updated, make sure the selection is valid
	// if the user-selected model is no longer in the list, update the selection for each feature that needs it to something relevant (the 0th model available, or null)
	let newModelSelectionOfFeature = state.modelSelectionOfFeature
	for (const featureName of featureNames) {

		const { filter } = modelFilterOfFeatureName[featureName]
		const filterOpts = { chatMode: state.globalSettings.chatMode, overridesOfModel: state.overridesOfModel }
		const modelOptionsForThisFeature = newModelOptions.filter((o) => filter(o.selection, filterOpts))

		const modelSelectionAtFeature = newModelSelectionOfFeature[featureName]
		const selnIdx = modelSelectionAtFeature === null ? -1 : modelOptionsForThisFeature.findIndex(m => modelSelectionsEqual(m.selection, modelSelectionAtFeature))

		if (selnIdx !== -1) continue // no longer in list, so update to 1st in list or null

		newModelSelectionOfFeature = {
			...newModelSelectionOfFeature,
			[featureName]: modelOptionsForThisFeature.length === 0 ? null : modelOptionsForThisFeature[0].selection
		}
	}


	const newState = {
		...state,
		settingsOfProvider: newSettingsOfProvider,
		modelSelectionOfFeature: newModelSelectionOfFeature,
		overridesOfModel: state.overridesOfModel,
		_modelOptions: newModelOptions,
	} satisfies VoidSettingsState

	return newState
}





const defaultState = () => {
	const d: VoidSettingsState = {
		settingsOfProvider: deepClone(defaultSettingsOfProvider),
		modelSelectionOfFeature: { 'Chat': null, 'Ctrl+K': null, 'Autocomplete': null, 'Apply': null, 'SCM': null },
		globalSettings: deepClone(defaultGlobalSettings),
		optionsOfModelSelection: { 'Chat': {}, 'Ctrl+K': {}, 'Autocomplete': {}, 'Apply': {}, 'SCM': {} },
		overridesOfModel: deepClone(defaultOverridesOfModel),
		freeModelsOnly: false,
		freeModelsAutoSwitched: false,
		_modelOptions: [], // computed later
		mcpUserStateOfName: {},
	}
	return d
}


export const IVoidSettingsService = createDecorator<IVoidSettingsService>('VoidSettingsService');
class VoidSettingsService extends Disposable implements IVoidSettingsService {
	_serviceBrand: undefined;

	private readonly _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event; // this is primarily for use in react, so react can listen + update on state changes

	state: VoidSettingsState;

	private readonly _resolver: () => void
	waitForInitState: Promise<void> // await this if you need a valid state initially

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IEncryptionService private readonly _encryptionService: IEncryptionService,
		@IMetricsService private readonly _metricsService: IMetricsService,
		@ILogService private readonly _logService: ILogService,
		// could have used this, but it's clearer the way it is (+ slightly different eg StorageTarget.USER)
		// @ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
	) {
		super()

		// at the start, we haven't read the partial config yet, but we need to set state to something
		this.state = defaultState()
		let resolver: () => void = () => { }
		this.waitForInitState = new Promise((res, rej) => resolver = res)
		this._resolver = resolver

		this.readAndInitializeState()
	}

	private _didInit = false




	dangerousSetState = async (newState: VoidSettingsState) => {
		this.state = _validatedModelState(newState)
		await this._storeState()
		this._onDidChangeState.fire()
		this._onUpdate_syncApplyToChat()
		this._onUpdate_syncSCMToChat()
	}
	async resetState() {
		await this.dangerousSetState(defaultState())
	}




	async readAndInitializeState() {
		let readS: VoidSettingsState = defaultState()
		try {
			readS = (await this._readState()) ?? readS;
			// 1.0.3 addition, remove when enough users have had this code run
			if (readS.globalSettings.includeToolLintErrors === undefined) readS.globalSettings.includeToolLintErrors = true

			// autoapprove is now an obj not a boolean (1.2.5)
			if (typeof readS.globalSettings.autoApprove === 'boolean') readS.globalSettings.autoApprove = {}

			// 1.3.5 add source control feature
			if (readS.modelSelectionOfFeature && !readS.modelSelectionOfFeature['SCM']) {
				readS.modelSelectionOfFeature['SCM'] = deepClone(readS.modelSelectionOfFeature['Chat'])
				readS.optionsOfModelSelection['SCM'] = deepClone(readS.optionsOfModelSelection['Chat'])
			}
			// add disableSystemMessage feature
			if (readS.globalSettings.disableSystemMessage === undefined) readS.globalSettings.disableSystemMessage = false;
			
			// add autoAcceptLLMChanges feature
			if (readS.globalSettings.autoAcceptLLMChanges === undefined) readS.globalSettings.autoAcceptLLMChanges = false;
			if (readS.globalSettings.enableCodebaseSemanticRerank === undefined) readS.globalSettings.enableCodebaseSemanticRerank = true;
			if (readS.globalSettings.codebaseEmbeddingModel === undefined) readS.globalSettings.codebaseEmbeddingModel = 'nomic-embed-text';
			if (readS.globalSettings.codebaseAutoRetrievalMinScore === undefined) readS.globalSettings.codebaseAutoRetrievalMinScore = 0.75;
		}
		catch (e) {
			// не подменяем состояние дефолтами: иначе первый же клик перезапишет настройки
			this._logService.error('[LuckySettings] failed to apply settings migrations', e)
		}

		// the stored data structure might be outdated, so we need to update it here
		try {
			readS = {
				...defaultState(),
				...readS,
				// no idea why this was here, seems like a bug
				// ...defaultSettingsOfProvider,
				// ...readS.settingsOfProvider,
			}

			for (const providerName of providerNames) {
				readS.settingsOfProvider[providerName] = {
					...defaultSettingsOfProvider[providerName],
					...readS.settingsOfProvider[providerName],
				} as any

				// conversion from 1.0.3 to 1.2.5 (can remove this when enough people update)
				for (const m of readS.settingsOfProvider[providerName].models) {
					if (!m.type) {
						const old = (m as { isAutodetected?: boolean; isDefault?: boolean })
						if (old.isAutodetected)
							m.type = 'autodetected'
						else if (old.isDefault)
							m.type = 'default'
						else m.type = 'custom'
					}
				}

				// remove when enough people have had it run (default is now {})
				if (providerName === 'openAICompatible' && !readS.settingsOfProvider[providerName].headersJSON) {
					readS.settingsOfProvider[providerName].headersJSON = '{}'
				}
			}
		}

		catch (e) {
			// важно: оставляем считанное состояние как есть, а не заменяем дефолтами
			this._logService.error('[LuckySettings] failed to normalize stored settings, keeping them as is', e)
		}

		this.state = readS
		this.state = _stateWithMergedDefaultModels(this.state)
		this.state = _validatedModelState(this.state);


		this._didInit = true
		this._resolver();
		this._onDidChangeState.fire();

	}


	/**
	 * Читает состояние настроек.
	 *
	 * Порядок: актуальный ключ → устаревшие ключи (данные старых версий) → резервные копии.
	 * Возвращает null только если ни одного читаемого значения нет (первый запуск или полное повреждение).
	 */
	private async _readState(): Promise<VoidSettingsState | null> {
		const candidateKeys: string[] = [
			SETTINGS_STORAGE_KEY,
			...LEGACY_SETTINGS_STORAGE_KEYS,
			...SETTINGS_BACKUP_STORAGE_KEYS,
		]
		let sawUnreadableValue = false

		for (const key of candidateKeys) {
			const encryptedState = this._storageService.get(key, StorageScope.APPLICATION)
			if (!encryptedState) continue

			const state = await this._tryDecrypt(key, encryptedState)
			if (!state) {
				sawUnreadableValue = true
				continue
			}

			if (key !== SETTINGS_STORAGE_KEY) {
				this._logService.warn(`[LuckySettings] settings restored from "${key}"`)
			}
			return state
		}

		if (sawUnreadableValue) this._preserveUnreadableState()
		return null
	}

	private async _tryDecrypt(key: string, encryptedState: string): Promise<VoidSettingsState | null> {
		try {
			const stateStr = await this._encryptionService.decrypt(encryptedState)
			const state = JSON.parse(stateStr)
			if (!state || typeof state !== 'object') throw new Error('stored settings is not an object')
			return state as VoidSettingsState
		}
		catch (e) {
			this._logService.error(`[LuckySettings] cannot read settings from "${key}"`, e)
			return null
		}
	}

	/** Нечитаемое значение не теряем: сохраняем отдельным ключом, чтобы можно было спасти вручную. */
	private _preserveUnreadableState() {
		try {
			if (this._storageService.get(SETTINGS_CORRUPT_STORAGE_KEY, StorageScope.APPLICATION)) return

			const candidates = [SETTINGS_STORAGE_KEY, ...LEGACY_SETTINGS_STORAGE_KEYS]
			for (const key of candidates) {
				const value = this._storageService.get(key, StorageScope.APPLICATION)
				if (!value) continue
				this._storageService.store(SETTINGS_CORRUPT_STORAGE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER)
				this._logService.warn(`[LuckySettings] unreadable settings preserved (from "${key}") under ` +
					`"${SETTINGS_CORRUPT_STORAGE_KEY}": настройки сброшены, но старое значение можно восстановить`)
				return
			}
		}
		catch (e) {
			this._logService.error('[LuckySettings] failed to preserve unreadable settings', e)
		}
	}

	/** Сдвигает кольцо резервных копий: текущее → backup1 → backup2 → backup3. */
	private _rotateBackups() {
		let value = this._storageService.get(SETTINGS_STORAGE_KEY, StorageScope.APPLICATION)
		for (const backupKey of SETTINGS_BACKUP_STORAGE_KEYS) {
			const previous = this._storageService.get(backupKey, StorageScope.APPLICATION)
			if (value) this._storageService.store(backupKey, value, StorageScope.APPLICATION, StorageTarget.USER)
			value = previous
		}
	}


	private async _storeState() {
		// до окончания инициализации не пишем: иначе дефолтное состояние затрёт
		// считанные с диска настройки (гонка на старте окна)
		if (!this._didInit) {
			this._logService.trace('[LuckySettings] skip store before init is finished')
			return
		}

		const state = this.state
		const encryptedState = await this._encryptionService.encrypt(JSON.stringify(state))

		this._rotateBackups()
		this._storageService.store(SETTINGS_STORAGE_KEY, encryptedState, StorageScope.APPLICATION, StorageTarget.USER);

		// сразу сбрасываем на диск: настройки должны переживать крах окна и выключение ПК
		await this._storageService.flush()
	}

	setSettingOfProvider: SetSettingOfProviderFn = async (providerName, settingName, newVal) => {

		const newModelSelectionOfFeature = this.state.modelSelectionOfFeature

		const newOptionsOfModelSelection = this.state.optionsOfModelSelection

		const newSettingsOfProvider: SettingsOfProvider = {
			...this.state.settingsOfProvider,
			[providerName]: {
				...this.state.settingsOfProvider[providerName],
				[settingName]: newVal,
			}
		}

		const newGlobalSettings = this.state.globalSettings
		const newOverridesOfModel = this.state.overridesOfModel
		const newMCPUserStateOfName = this.state.mcpUserStateOfName

		const newState = {
			modelSelectionOfFeature: newModelSelectionOfFeature,
			optionsOfModelSelection: newOptionsOfModelSelection,
			settingsOfProvider: newSettingsOfProvider,
			globalSettings: newGlobalSettings,
			overridesOfModel: newOverridesOfModel,
			mcpUserStateOfName: newMCPUserStateOfName,
			freeModelsOnly: this.state.freeModelsOnly,
			freeModelsAutoSwitched: this.state.freeModelsAutoSwitched,
		}

		this.state = _validatedModelState(newState)

		await this._storeState()
		this._onDidChangeState.fire()

	}


	private _onUpdate_syncApplyToChat() {
		// if sync is turned on, sync (call this whenever Chat model or !!sync changes)
		this.setModelSelectionOfFeature('Apply', deepClone(this.state.modelSelectionOfFeature['Chat']))
	}

	private _onUpdate_syncSCMToChat() {
		this.setModelSelectionOfFeature('SCM', deepClone(this.state.modelSelectionOfFeature['Chat']))
	}

	setGlobalSetting: SetGlobalSettingFn = async (settingName, newVal) => {
		const newState: VoidSettingsState = {
			...this.state,
			globalSettings: {
				...this.state.globalSettings,
				[settingName]: newVal
			}
		}
		this.state = _validatedModelState(newState)
		await this._storeState()
		this._onDidChangeState.fire()

		// hooks
		if (this.state.globalSettings.syncApplyToChat) this._onUpdate_syncApplyToChat()
		if (this.state.globalSettings.syncSCMToChat) this._onUpdate_syncSCMToChat()

	}

	/**
	 * Режим «только бесплатные модели».
	 * При включении платные модели исчезают из выбора, а выбранная платная
	 * заменяется на первую доступную бесплатную.
	 */
	setFreeModelsOnly = async (newVal: boolean) => {
		if (this.state.freeModelsOnly === newVal) return
		const newState: VoidSettingsState = { ...this.state, freeModelsOnly: newVal }
		this.state = _validatedModelState(newState)
		await this._storeState()
		this._onDidChangeState.fire()

		// если выбрана платная модель, выше она уже заменена на бесплатную — подтягиваем зависимые фичи
		if (this.state.globalSettings.syncApplyToChat) this._onUpdate_syncApplyToChat()
		if (this.state.globalSettings.syncSCMToChat) this._onUpdate_syncSCMToChat()
	}

	/**
	 * Запоминает модель, которая реально ответила при авто-переключении.
	 * Нужно, чтобы в чате было видно ту модель, которая пишет ответ, а не выбранную ранее.
	 */
	setModelSelectionOfFeatureAuto = async (featureName: FeatureName, newVal: ModelSelection) => {
		const newState: VoidSettingsState = {
			...this.state,
			modelSelectionOfFeature: {
				...this.state.modelSelectionOfFeature,
				[featureName]: newVal,
			},
			freeModelsAutoSwitched: true,
		}
		this.state = _validatedModelState(newState)
		await this._storeState()
		this._onDidChangeState.fire()
	}


	setModelSelectionOfFeature: SetModelSelectionOfFeatureFn = async (featureName, newVal) => {
		const newState: VoidSettingsState = {
			...this.state,
			modelSelectionOfFeature: {
				...this.state.modelSelectionOfFeature,
				[featureName]: newVal
			},
			// выбор сделан руками — пометка «авто» больше не актуальна
			freeModelsAutoSwitched: false,
		}

		this.state = _validatedModelState(newState)

		await this._storeState()
		this._onDidChangeState.fire()

		// hooks
		if (featureName === 'Chat') {
			// When Chat model changes, update synced features
			this._onUpdate_syncApplyToChat()
			this._onUpdate_syncSCMToChat()
		}
	}


	setOptionsOfModelSelection = async (featureName: FeatureName, providerName: ProviderName, modelName: string, newVal: Partial<ModelSelectionOptions>) => {
		const newState: VoidSettingsState = {
			...this.state,
			optionsOfModelSelection: {
				...this.state.optionsOfModelSelection,
				[featureName]: {
					...this.state.optionsOfModelSelection[featureName],
					[providerName]: {
						...this.state.optionsOfModelSelection[featureName][providerName],
						[modelName]: {
							...this.state.optionsOfModelSelection[featureName][providerName]?.[modelName],
							...newVal
						}
					}
				}
			}
		}
		this.state = _validatedModelState(newState)

		await this._storeState()
		this._onDidChangeState.fire()
	}

	setOverridesOfModel = async (providerName: ProviderName, modelName: string, overrides: Partial<ModelOverrides> | undefined) => {
		const newState: VoidSettingsState = {
			...this.state,
			overridesOfModel: {
				...this.state.overridesOfModel,
				[providerName]: {
					...this.state.overridesOfModel[providerName],
					[modelName]: overrides === undefined ? undefined : {
						...this.state.overridesOfModel[providerName][modelName],
						...overrides
					},
				}
			}
		};

		this.state = _validatedModelState(newState);
		await this._storeState();
		this._onDidChangeState.fire();

		this._metricsService.capture('Update Model Overrides', { providerName, modelName, overrides });
	}




	/**
	 * Синхронизация списка моделей с провайдером.
	 *
	 * Раньше список из API ЗАМЕНЯЛ всё, что было: модели, которых провайдер не вернул
	 * в этот раз (сбой сети, лимит, смена каталога), пропадали, а выбранная модель
	 * откатывалась на первую доступную. Теперь список только пополняется:
	 * сначала идут модели из API, затем ранее сохранённые.
	 */
	setSyncedModels(providerName: ProviderName, modelNames: string[]) {
		const { models } = this.state.settingsOfProvider[providerName]

		const existingByName: Record<string, VoidStatefulModelInfo> = {}
		for (const model of models) existingByName[model.modelName] = model

		const syncedNames = new Set(modelNames)
		const syncedModels: VoidStatefulModelInfo[] = modelNames.map(modelName => ({
			modelName,
			type: existingByName[modelName]?.type ?? 'default',
			isHidden: !!existingByName[modelName]?.isHidden,
		}))
		// всё, что уже было и не пришло в этот раз, сохраняем — не теряем выбор пользователя
		const keptModels = models.filter(m => !syncedNames.has(m.modelName))

		const newModels = [...syncedModels, ...keptModels]
		const didChange = newModels.length !== models.length
			|| newModels.some((m, i) => models[i].modelName !== m.modelName || !!models[i].isHidden !== m.isHidden)
		if (!didChange) return

		this.setSettingOfProvider(providerName, 'models', newModels)
	}

	setAutodetectedModels(providerName: ProviderName, autodetectedModelNames: string[], logging: object) {

		const { models } = this.state.settingsOfProvider[providerName]
		const oldModelNames = models.map(m => m.modelName)

		const newModels = _modelsWithAddedNewModels({ existingModels: models, models: autodetectedModelNames, type: 'autodetected' })
		this.setSettingOfProvider(providerName, 'models', newModels)

		// if the models changed, log it
		const new_names = newModels.map(m => m.modelName)
		if (!(oldModelNames.length === new_names.length
			&& oldModelNames.every((_, i) => oldModelNames[i] === new_names[i]))
		) {
			this._metricsService.capture('Autodetect Models', { providerName, newModels: newModels, ...logging })
		}
	}
	toggleModelHidden(providerName: ProviderName, modelName: string) {


		const { models } = this.state.settingsOfProvider[providerName]
		const modelIdx = models.findIndex(m => m.modelName === modelName)
		if (modelIdx === -1) return
		const newIsHidden = !models[modelIdx].isHidden
		const newModels: VoidStatefulModelInfo[] = [
			...models.slice(0, modelIdx),
			{ ...models[modelIdx], isHidden: newIsHidden },
			...models.slice(modelIdx + 1, Infinity)
		]
		this.setSettingOfProvider(providerName, 'models', newModels)

		this._metricsService.capture('Toggle Model Hidden', { providerName, modelName, newIsHidden })

	}
	addModel(providerName: ProviderName, modelName: string) {
		const { models } = this.state.settingsOfProvider[providerName]
		const existingIdx = models.findIndex(m => m.modelName === modelName)
		if (existingIdx !== -1) return // if exists, do nothing
		const newModels = [
			...models,
			{ modelName, type: 'custom', isHidden: false } as const
		]
		this.setSettingOfProvider(providerName, 'models', newModels)

		this._metricsService.capture('Add Model', { providerName, modelName })

	}
	deleteModel(providerName: ProviderName, modelName: string): boolean {
		const { models } = this.state.settingsOfProvider[providerName]
		const delIdx = models.findIndex(m => m.modelName === modelName)
		if (delIdx === -1) return false
		const newModels = [
			...models.slice(0, delIdx), // delete the idx
			...models.slice(delIdx + 1, Infinity)
		]
		this.setSettingOfProvider(providerName, 'models', newModels)

		this._metricsService.capture('Delete Model', { providerName, modelName })

		return true
	}

	// MCP Server State
	private _setMCPUserStateOfName = async (newStates: MCPUserStateOfName) => {
		const newState: VoidSettingsState = {
			...this.state,
			mcpUserStateOfName: {
				...this.state.mcpUserStateOfName,
				...newStates
			}
		};
		this.state = _validatedModelState(newState);
		await this._storeState();
		this._onDidChangeState.fire();
		this._metricsService.capture('Set MCP Server States', { newStates });
	}

	addMCPUserStateOfNames = async (newMCPStates: MCPUserStateOfName) => {
		const { mcpUserStateOfName: mcpServerStates } = this.state
		const newMCPServerStates = {
			...mcpServerStates,
			...newMCPStates,
		}
		await this._setMCPUserStateOfName(newMCPServerStates)
		this._metricsService.capture('Add MCP Servers', { servers: Object.keys(newMCPStates).join(', ') });
	}

	removeMCPUserStateOfNames = async (serverNames: string[]) => {
		const { mcpUserStateOfName: mcpServerStates } = this.state
		const newMCPServerStates = {
			...mcpServerStates,
		}
		serverNames.forEach(serverName => {
			if (serverName in newMCPServerStates) {
				delete newMCPServerStates[serverName]
			}
		})
		await this._setMCPUserStateOfName(newMCPServerStates)
		this._metricsService.capture('Remove MCP Servers', { servers: serverNames.join(', ') });
	}

	setMCPServerState = async (serverName: string, state: MCPUserState) => {
		const { mcpUserStateOfName } = this.state
		const newMCPServerStates = {
			...mcpUserStateOfName,
			[serverName]: state,
		}
		await this._setMCPUserStateOfName(newMCPServerStates)
		this._metricsService.capture('Update MCP Server State', { serverName, state });
	}

}


registerSingleton(IVoidSettingsService, VoidSettingsService, InstantiationType.Eager);
