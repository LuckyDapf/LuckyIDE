/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageTarget, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IApplicationStorageMainService } from '../../../../platform/storage/electron-main/storageMainService.js';

import { IMetricsService } from '../common/metricsService.js';
import { PostHog } from 'posthog-node'
import { OPT_OUT_KEY, LEGACY_OPT_OUT_KEY } from '../common/storageKeys.js';


const os = isWindows ? 'windows' : isMacintosh ? 'mac' : isLinux ? 'linux' : null
const _getOSInfo = () => {
	try {
		const { platform, arch } = process // see platform.ts
		return { platform, arch }
	}
	catch (e) {
		return { osInfo: { platform: '??', arch: '??' } }
	}
}
const osInfo = _getOSInfo()

// we'd like to use devDeviceId on telemetryService, but that gets sanitized by the time it gets here as 'someValue.devDeviceId'



export class MetricsMainService extends Disposable implements IMetricsService {
	_serviceBrand: undefined;

	private readonly client: PostHog | null

	private _initProperties: object = {}


	// helper - looks like this is stored in a .vscdb file in ~/Library/Application Support/Lucky IDE
	private _memoStorage(key: string, target: StorageTarget, setValIfNotExist?: string, legacyKeys: readonly string[] = []) {
		const currVal = this._appStorage.get(key, StorageScope.APPLICATION)
		if (currVal !== undefined) return currVal

		// переносим значение из старого ключа, чтобы identity пользователя не менялась
		for (const legacyKey of legacyKeys) {
			const legacyVal = this._appStorage.get(legacyKey, StorageScope.APPLICATION)
			if (legacyVal !== undefined) {
				this._appStorage.store(key, legacyVal, StorageScope.APPLICATION, target)
				return legacyVal
			}
		}

		const newVal = setValIfNotExist ?? generateUuid()
		this._appStorage.store(key, newVal, StorageScope.APPLICATION, target)
		return newVal
	}


	// this is old, eventually we can just delete this since all the keys will have been transferred over
	// returns 'NULL' or the old key
	private get oldId() {
		// check new storage key first
		const newKey = 'lucky.app.oldMachineId'
		const newOldId = this._appStorage.get(newKey, StorageScope.APPLICATION)
		if (newOldId) return newOldId

		// put old key into new key if didn't already
		const oldValue = this._appStorage.get('void.app.oldMachineId', StorageScope.APPLICATION)
			?? this._appStorage.get('void.machineId', StorageScope.APPLICATION) // the old way of getting the key
			?? 'NULL'
		this._appStorage.store(newKey, oldValue, StorageScope.APPLICATION, StorageTarget.MACHINE)
		return oldValue
	}


	// the main id
	private get distinctId() {
		const oldId = this.oldId
		const setValIfNotExist = oldId === 'NULL' ? undefined : oldId
		return this._memoStorage('lucky.app.machineId', StorageTarget.MACHINE, setValIfNotExist, ['void.app.machineId'])
	}

	// just to see if there are ever multiple machineIDs per userID (instead of this, we should just track by the user's email)
	private get userId() {
		return this._memoStorage('lucky.app.userMachineId', StorageTarget.USER, undefined, ['void.app.userMachineId'])
	}

	constructor(
		@IProductService private readonly _productService: IProductService,
		@IEnvironmentMainService private readonly _envMainService: IEnvironmentMainService,
		@IApplicationStorageMainService private readonly _appStorage: IApplicationStorageMainService,
	) {
		super()
		// Ключ аналитики больше не хранится в исходниках: задаётся переменной окружения.
		// Без ключа телеметрия полностью отключена (клиент не создаётся и ничего не отправляет).
		const posthogKey = process.env['LUCKY_POSTHOG_KEY'] ?? ''
		this.client = posthogKey
			? new PostHog(posthogKey, { host: 'https://us.i.posthog.com' })
			: null
		if (!this.client) {
			console.log('[Lucky IDE] metrics disabled: LUCKY_POSTHOG_KEY is not set')
		}

		this.initialize() // async
	}

	async initialize() {
		// very important to await whenReady!
		await this._appStorage.whenReady

		const { commit, version, voidVersion, release, quality } = this._productService

		const isDevMode = !this._envMainService.isBuilt // found in abstractUpdateService.ts

		// custom properties we identify
		this._initProperties = {
			commit,
			vscodeVersion: version,
			voidVersion: voidVersion,
			release,
			os,
			quality,
			distinctId: this.distinctId,
			distinctIdUser: this.userId,
			oldId: this.oldId,
			isDevMode,
			...osInfo,
		}

		const identifyMessage = {
			distinctId: this.distinctId,
			properties: this._initProperties,
		}

		const didOptOut = this._appStorage.getBoolean(OPT_OUT_KEY, StorageScope.APPLICATION,
			this._appStorage.getBoolean(LEGACY_OPT_OUT_KEY, StorageScope.APPLICATION, false))

		console.log('User is opted out of basic Lucky IDE metrics?', didOptOut)
		if (didOptOut) {
			this.client?.optOut()
		}
		else {
			this.client?.optIn()
			this.client?.identify(identifyMessage)
		}


		console.log('Lucky IDE posthog metrics info:', JSON.stringify(identifyMessage, null, 2))
	}


	capture: IMetricsService['capture'] = (event, params) => {
		const capture = { distinctId: this.distinctId, event, properties: params } as const
		// console.log('full capture:', this.distinctId)
		this.client?.capture(capture)
	}

	setOptOut: IMetricsService['setOptOut'] = (newVal: boolean) => {
		if (newVal) {
			this._appStorage.store(OPT_OUT_KEY, 'true', StorageScope.APPLICATION, StorageTarget.MACHINE)
		}
		else {
			this._appStorage.remove(OPT_OUT_KEY, StorageScope.APPLICATION)
		}
		// старый ключ больше не используется — убираем, чтобы не расходились значения
		this._appStorage.remove(LEGACY_OPT_OUT_KEY, StorageScope.APPLICATION)
	}

	async getDebuggingProperties() {
		return this._initProperties
	}
}


