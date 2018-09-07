import * as async from 'async'
import * as encryption from './encryption-providers'
import * as rpc from './rpc-providers'
import * as storage from './storage-providers'

import { 
    createFileFromTuple, 
    createPermissionFromTuple, 
    createSettingsFromTuple } from './utils'
import { DatastoreSettings } from './datastore-settings';
import { RpcProvider } from './rpc-providers/rpc-provider';



export const providers = { storage, encryption, rpc }

export class DatastoreOptions {
    rpcProvider: any
}

export class Datastore {
    private _storage: storage.StorageProvider
    private _encryption
    private _rpc: RpcProvider
    private _contract: rpc.RpcProviderContract
    private _settings: DatastoreSettings
    private _isInit

    /**
     * Creates a new Datastore instance
     * 
     * @param {Object} opts.rpcProvider - RPC provider (Web3, Aragon)
     */
    constructor(opts?: DatastoreOptions) {
        opts = Object.assign(new DatastoreOptions(), opts || {})

        this._rpc = opts.rpcProvider
        this._isInit = this._initialize()
    }

    private async _initialize() {
        // Initialize only once
        if (!this._isInit) {
            this._contract = await this._rpc.getContract()
            await this._refreshSettings()
        }
        else {
            return this._isInit
        }
    }

    private async _refreshSettings() {
        this._settings = createSettingsFromTuple(await this._contract.settings())
        this._storage = storage.getStorageProviderFromSettings(this._settings)
        this._encryption = new providers.encryption.Aes()
    }

    /**
     * Add a new file to the Datastore
     * @param {string} name - File name
     * @param {ArrayBuffer} file - File content
     */
    async addFile(name: string, file: ArrayBuffer) {
        await this._initialize()

        const storageId = await this._storage.addFile(file)
        const fileId = await this._contract.addFile(storageId, name, file.byteLength, true)
        return fileId
    }

    /**
     * Returns a file and its content from its Id
     * @param {number} fileId 
     * @returns {Promise<File>}
     */
    async getFile(fileId: number) {
        await this._initialize()

        const fileInfo = await this.getFileInfo(fileId)
        const fileContent = await this._storage.getFile(fileInfo.storageRef)

        return { ...fileInfo, content: fileContent }
    }

    /**
     * Returns the file information without the content
     * @param {number} fileId 
     */
    async getFileInfo(fileId: number) {
        await this._initialize() 

        const fileTuple = await this._contract.getFile(fileId)
        return { id: fileId, ...createFileFromTuple(fileTuple) }
    }


    /**
     * Delete the specified file
     * @param {number} fileId 
     */
    async deleteFile(fileId: number) {
        await this._initialize() 

        await this._contract.deleteFile(fileId)
    }


    async getFilePermissions(fileId: number) {
        await this._initialize()

        const entitiesAddress = await this._contract.getPermissionAddresses(fileId)

        return Promise.all(
            entitiesAddress.map(async entity => ({
                entity,
                ...createPermissionFromTuple(await this._contract.getPermission(fileId, entity))
            })) 
        )
    }

    /**
     * Fetch the datastore settings
     */
    async getSettings(): Promise<DatastoreSettings> {
        await this._initialize()

        return this._settings
    }


    async setIpfsStorageSettings(host: string, port: number, protocol: string) {
        await this._initialize()

        await this._contract.setIpfsStorageSettings(host, port, protocol)
        await this._refreshSettings()
    }

    /**
     * Returns files information
     */
    async listFiles() {
        await this._initialize()

        const lastFileId = (await this._contract.lastFileId()).toNumber()
        let files = []
        
        // TODO: Optimize this code
        for (let i = 1; i <= lastFileId; i++) {
            files[i] = await this.getFileInfo(i)
        }

        return files
    }

    /**
     * Replace content for a specific file
     * @param {number} fileId File Id
     * @param {ArrayBuffer} file File content
     */
    async setFileContent(fileId: number, file: ArrayBuffer) {
        await this._initialize()

        const storageId = await this._storage.addFile(file)
        await this._contract.setFileContent(fileId, storageId, file.byteLength)
    }

    /**
     * Add/Remove read permission to an entity for
     * a specific file
     * 
     * @param {number} fileId File Id
     * @param {string} entity Entity address
     * @param {boolean} hasPermission Write permission
     */
    async setReadPermission(fileId: number, entity: string, hasPermission: boolean) {
        await this._initialize()

        await this._contract.setReadPermission(fileId, entity, hasPermission)
    }

    /**
     * Add/Remove write permission to an entity for
     * a specific file
     * 
     * @param {number} fileId File Id
     * @param {string} entity Entity address
     * @param {boolean} hasPermission Write permission
     */
    async setWritePermission(fileId: number, entity: string, hasPermission: boolean) {
        await this._initialize()

        await this._contract.setWritePermission(fileId, entity, hasPermission)
    }

    /**
     * Changes name of a file for `newName`
     * @param {number} fileId File Id
     * @param {string} newName New file name
     */
    async setFilename(fileId: number, newName: string) {
        await this._initialize()

        await this._contract.setFilename(fileId, newName)
    }

    /**
     * Creates a new group of entities
     * @param groupName Name of the group
     */
    async createGroup(groupName: string) {
        await this._initialize()

        await this._contract.createGroup(groupName)
    }

    /**
     * Deletes a group
     * @param groupId Id of the group
     */
    async deleteGroup(groupId: number) {
        await this._initialize()

        await this._contract.deleteGroup(groupId)
    }

    /**
     * Rename an existing group
     * @param groupId Id of the group to rename
     * @param newGroupName New group name
     */
    async renameGroup(groupId: number, newGroupName: string) {
        await this._initialize()

        await this._contract.renameGroup(groupId, newGroupName)
    }

    /**
     * Returns a list of the group names
     */
    async getGroups() {
        await this._initialize()

        await this._contract.getGroups()
    }

    /**
     * Returns an array of all the groups infos
     */
    async getGroupsInfos() {
        await this._initialize()

        let groups = []
        let groupsIds = await this._contract.getGroups()
        for(var i = 0; i < groupsIds.length; i++) {
            let getGroup = await this._contract.getGroup(groupsIds[i])
            let group = {
                id: groupsIds[i],
                name: getGroup[0],
                entities: getGroup[1]
            }
            if(group.name != 0)
                groups.push(group)
        }
        return groups
    }

    /**
     * Returns the entities from a group
     * @param groupId Id of the group to get entities from
     */
    async getGroup(groupId: number) {
        await this._initialize()

        await this._contract.getGroup(groupId)
    }

    /**
     * Returns an entity from the `entities` array 
     * @param groupId Id of the group to get entity from
     * @param entityIndex Index of that entity in the `entities` array
     */
    async getGroupEntity(groupId: number, entityIndex: number) {
        await this._initialize()

        await this._contract.getGroupEntity(groupId, entityIndex)
    }

    /**
     * Returns the number of entities in the specified group
     * @param groupId Id of the group to get count from
     */
    async getGroupCount(groupId: number) {
        await this._initialize()

        await this._contract.getGroupCount(groupId)
    }

    /**
     * Add an entity to a group
     * @param groupId Id of the group to insert the entity in
     * @param entity Entity to add in group
     */
    async addEntityToGroup(groupId: number, entity: string) {
        await this._initialize()

        await this._contract.addEntityToGroup(groupId, entity)
    }

    /**
     * Removes an entity from a group
     * @param groupId Id of the group to remove the entity from
     * @param entity Entity to remove from group
     */
    async removeEntityFromGroup(groupId: number, entity: string) {
        await this._initialize()

        await this._contract.removeEntityFromGroup(groupId, entity)
    }

    /**
     * Datastore events
     * 
     */
    async events(...args) {
        // TODO: Return an Observable without async
        await this._initialize()
        
        return this._contract.events(...args)
    }

}
