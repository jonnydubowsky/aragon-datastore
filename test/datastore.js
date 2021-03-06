const _ = require('lodash')

const Datastore = artifacts.require('Datastore')
const DatastoreACL = artifacts.require('DatastoreACL')
const DAOFactory = artifacts.require('@aragon/core/contracts/factory/DAOFactory')
const EVMScriptRegistryFactory = artifacts.require('@aragon/core/contracts/factory/EVMScriptRegistryFactory')
const ACL = artifacts.require('@aragon/core/contracts/acl/ACL')
const Kernel = artifacts.require('@aragon/core/contracts/kernel/Kernel')
const TestDatastore = artifacts.require('TestDatastore')

//contract = () => 0

contract('Datastore ', accounts => {
    let datastore
    let daoFact
    let acl
    let kernel
    let kernelBase
    let aclBase
    let APP_MANAGER_ROLE
    let datastoreACL
    let helper

    const root = accounts[0]
    const holder = accounts[1]
    const DUMMY_ROLE = 1


    before(async () => {
        aclBase = await ACL.new()        
        kernelBase = await Kernel.new(true)
        helper = await TestDatastore.new()
    })

    beforeEach(async () => {
        
        const regFact = await EVMScriptRegistryFactory.new()
        daoFact = await DAOFactory.new(kernelBase.address, aclBase.address, regFact.address)        

        const r = await daoFact.newDAO(root)
        kernel = Kernel.at(r.logs.filter(l => l.event == 'DeployDAO')[0].args.dao)
        acl = ACL.at(await kernel.acl())         
        
        APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE()

        await acl.createPermission(holder, kernel.address, APP_MANAGER_ROLE, holder, { from: root })

        const receipt = await kernel.newAppInstance(await helper.apmNamehash("datastore"), (await Datastore.new()).address, { from: holder })        
        datastore = Datastore.at(receipt.logs.filter(l => l.event == 'NewAppProxy')[0].args.proxy)

        const daclReceipt = await kernel.newAppInstance(await helper.apmNamehash("datastore-acl"), (await DatastoreACL.new()).address, { from: holder })        
        datastoreACL = DatastoreACL.at(daclReceipt.logs.filter(l => l.event == 'NewAppProxy')[0].args.proxy)

        await acl.createPermission(datastore.address, datastoreACL.address, await datastoreACL.DATASTOREACL_ADMIN_ROLE(), root)
        await acl.createPermission(root, datastore.address, await datastore.DATASTORE_MANAGER_ROLE(), root)
        await acl.grantPermission(root, datastore.address, await datastore.DATASTORE_MANAGER_ROLE())
        await acl.grantPermission(holder, datastore.address, await datastore.DATASTORE_MANAGER_ROLE())
        
         
        await datastoreACL.initialize() 
        await datastore.init(datastoreACL.address)

        await acl.grantPermission(datastoreACL.address, acl.address, await acl.CREATE_PERMISSIONS_ROLE())
    })

    it('increases lastFileId by 1 after addFile', async () => {
        assert.equal(await datastore.lastFileId(), 0)
        await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)
        assert.equal(await datastore.lastFileId(), 1)
    })    

    it('getFileAsCaller returns the right file data', async () => {
        const file1 = { 
            name: 'test name',
            storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
            size: 4567,
            isPublic: true
        }

        const file2 = { 
            name: 'test name2',
            storageRef: 'K4WWQSuPMS6aGCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
            size: 9872214,
            isPublic: false
        }        

        await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)
        await datastore.addFile(file2.storageRef, file2.name, file2.size, file2.isPublic)

        const getFile1 = await datastore.getFileAsCaller(1, '0xdeadbeef')
        assert.equal(getFile1[0], file1.storageRef)
        assert.equal(getFile1[1], file1.name)
        assert.equal(getFile1[2], file1.size)
        assert.equal(getFile1[3], file1.isPublic)
        assert.equal(getFile1[4], false) // isDeleted should be false

        const getFile2 = await datastore.getFileAsCaller(2, '0xdeadbeef')
        assert.equal(getFile2[0], file2.storageRef)
        assert.equal(getFile2[1], file2.name)
        assert.equal(getFile2[2], file2.size)
        assert.equal(getFile2[3], file2.isPublic)
        assert.equal(getFile2[4], false) // isDeleted should be false
        
    })
    
    xit('getFile returns the right file data', async () => {
        const file1 = { 
            name: 'test name',
            storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
            size: 4567,
            isPublic: true
        }

        const file2 = { 
            name: 'test name2',
            storageRef: 'K4WWQSuPMS6aGCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
            size: 9872214,
            isPublic: false
        }        

        await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)
        await datastore.addFile(file2.storageRef, file2.name, file2.size, file2.isPublic)

        const getFile1 = await datastore.getFileAsCaller(1, accounts[0])
        assert.equal(getFile1[0], file1.storageRef)
        assert.equal(getFile1[1], file1.name)
        assert.equal(getFile1[2], file1.size)
        assert.equal(getFile1[3], file1.isPublic)
        assert.equal(getFile1[4], false) // isDeleted should be false

        const getFile2 = await datastore.getFileAsCaller(2, accounts[0])
        assert.equal(getFile2[0], file2.storageRef)
        assert.equal(getFile2[1], file2.name)
        assert.equal(getFile2[2], file2.size)
        assert.equal(getFile2[3], file2.isPublic)
        assert.equal(getFile2[4], false) // isDeleted should be false
        
    })


    describe('deleteFile', async () => {

        it('deletes a file from the datastore', async () => {
            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: true
            }       

            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)
            await datastore.deleteFile(1)

            const getFile1 = await datastore.getFileAsCaller(1, accounts[0])
            assert.equal(getFile1[0], file1.storageRef)
            assert.equal(getFile1[1], file1.name)
            assert.equal(getFile1[2], file1.size)
            assert.equal(getFile1[3], file1.isPublic)
            assert.equal(getFile1[4], true) // isDeleted should be false      
        })


        it('throws when not called by owner', async () => {
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)

            assertThrow(async () => {
                await datastore.deleteFile(1, { from: accounts[1] })
            })
        })

    })

    describe('setFileName', async () => {

        it('throws when called with no write access', async () => {
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true, { from: accounts[0] })

            await assertThrow(async () => datastore.setFileName(1, 'new file name', { from: accounts[1] }))

        })

        it('changes filename when called with write access', async () => {
            const newFilename = 'new file name'

            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true, { from: accounts[0] })
            await datastore.setEntityPermissions(1, accounts[1], false, true)

            await datastore.setFileName(1, newFilename, { from: accounts[1] })
            
            const file = await datastore.getFileAsCaller(1, accounts[0])

            assert.equal(file[1], newFilename)
        })
      

        it('fires FileRename event', async () => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
            await datastore.setFileName(1, 'new file name')
    
            await assertEvent(datastore, { event: 'FileRename' })
        })          

    })

    describe('setFileContent', async () => {

        it('changes file content when setFileContent is called with write access', async () => {
            const newStorageRef = 'QmB3YrhJTHsV4X3vb2tWWQSuPMS6aXCbZKpEjPHPUZN2Nj'
            const newFileSize = 321

            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true, { from: accounts[0] })
            await datastore.setEntityPermissions(1, accounts[1], false, true)

            await datastore.setFileContent(1, newStorageRef, newFileSize, { from: accounts[1] })
            
            const file = await datastore.getFileAsCaller(1, accounts[0])

            assert.equal(file[0], newStorageRef)
            assert.equal(file[2], newFileSize)
        })  

        it('changes the storage reference and file size', async () => {
            const newStorageRef = 'Qm2NjB3YrhJTHsV4X3vb2tWWQSuPMS6aXCbZKpEjPHPUZN'
            const newFileSize = 9086
    
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)
            await datastore.setFileContent(1, newStorageRef, newFileSize)
    
            const file = await datastore.getFileAsCaller(1, accounts[0])
    
            assert.equal(file[0], newStorageRef)
            assert.equal(file[2], newFileSize)
        })        
        
        it('fires FileContentUpdate event on setFileContent call', async () => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
            await datastore.setFileContent(1, 'QmMWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 432)
    
            await assertEvent(datastore, { event: 'FileContentUpdate' })
        })         

        it('throws when setFileContent is called with no write access', async () => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', "file name", 100, true, { from: accounts[0] })

            await assertThrow(async () => datastore.setFileContent(1, 'QmB3YrhJTHsV4X3vb2tWWQSuPMS6aXCbZKpEjPHPUZN2Nj', 234, { from: accounts[1] }))
        }) 
    })
    
    it('fires NewFile event on addFile call', async () => {
        await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)

        await assertEvent(datastore, { event: 'NewFile' })
    })     
   
   
    describe('getEntitiesWithPermissionsOnFile', async () => {

        it('returns the right address list', async() => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', true, true)

            const addresses = await datastore.getEntitiesWithPermissionsOnFile(1)

            assert.equal(addresses.length, 1)
            assert.equal(addresses[0], '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
        })
        
    })

    describe('getGroupsWithPermissionsOnFile', async () => {

        it('returns the right group list', async() => {
            await datastore.createGroup('My first group')
            await datastore.createGroup('My second group')
            await datastore.createGroup('My third group')

            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
            await datastore.setGroupPermissions(1, 1, true, true)

            const groups = await datastore.getGroupsWithPermissionsOnFile(1)

            assert.equal(groups.length, 1)
            assert.equal(groups[0].toNumber(), 1)
        })
        
    })   
    
    describe('getEntityPermissionsOnFile', async () => {

        it('returns the read and write permissions', async() => {

            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', false, true)

            const permissions = await datastore.getEntityPermissionsOnFile(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')

            assert.equal(permissions[0], true)
            assert.equal(permissions[1], false)
        })
        
    })    *  

    describe('removeEntityFromFile', async () => {

        it('sets read and write permissions to false', async() => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)

            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef6', false, false)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', true, true)
            await datastore.removeEntityFromFile(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            await datastore.removeEntityFromFile(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef8')

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef8')), false)
        })

        it('fires EntityPermissionsRemoved event ', async () => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', true, false)
            await datastore.removeEntityFromFile(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')

            await assertEvent(datastore, { event: 'EntityPermissionsRemoved' })
        })   
        
        it('throws when not called by owner', async () => {
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', true, false)

            assertThrow(async () => {
                await datastore.removeEntityFromFile(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', { from: accounts[1] })
            })
        })        
        
    })

    describe('setEntityPermissions', async () => {

        it('sets read permissions on a file', async() => {
            const file = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file.storageRef, file.name, file.size, file.isPublic)

            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', false, true)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', false, false)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef8', true, false)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef8')), true)
        })

        it('sets write permissions on a file', async() => {
            const file = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file.storageRef, file.name, file.size, file.isPublic)

            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7', false, true)
            await datastore.setEntityPermissions(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef8', true, false)

            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), true)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef8')), false)
        })        

        it('fires NewEntityPermissions event ', async () => {
            await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true, { from: accounts[0] })
            await datastore.setEntityPermissions(1, accounts[1], true, false)

            await assertEvent(datastore, { event: 'NewEntityPermissions' })
        })  
        
        it('throws when not called by owner', async () => {
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)

            assertThrow(async () => {
                await datastore.setEntityPermissions(1, accounts[1], true, false, { from: accounts[1] })
            })
        })        
    })    
    
    it('getGroupPermissionsOnFile returns the right data', async() => {
        await datastore.createGroup('My first group')
        await datastore.createGroup('My second group')

        await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true)
        await datastore.setGroupPermissions(1, 1, true, false)

        const groupPermissions = await datastore.getGroupPermissionsOnFile(1, 1)

        assert.equal(groupPermissions[0], false)
        assert.equal(groupPermissions[1], true)
    })

    it('tests if ownership of files works correctly', async() => {
        await datastore.addFile('QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t', 'file name', 100, true, { from: accounts[0] })
        const file = await datastore.getFileAsCaller(1, accounts[0])

        assert.equal(file[5], accounts[0])
        assert.equal(file[6], true)
    })

    it('createGroup creates a new group', async () => {
        await datastore.createGroup('My first group')
        await datastore.createGroup('My second group')

        assert.equal((await datastore.getGroupIds())[0], 1)
        assert.equal((await datastore.getGroupIds())[1], 2)
    })

    describe('deleteGroup', async () => {
        it('deletes a group', async () => {
            await datastore.createGroup('My first group')
            await datastore.createGroup('My second group')
            await datastore.deleteGroup(2)

            assert.equal((await datastore.getGroupIds())[0], 1)
            assert.equal((await datastore.getGroupIds())[1], 0)
        })

        it("throws if group doesn't exist", async () => {
            await datastore.createGroup('My first group')
            
            assertThrow(async () => await datastore.deleteGroup(2))
        })
    })

    describe('renameGroup', async () => {

        it('renames an existing group', async() => {
            await datastore.createGroup('My old name')
            await datastore.renameGroup(1, 'My new name')
            var group = await datastore.getGroup(1)

            assert.equal(group[1], 'My new name')
        })

        it("throws if group doesn't exist", async () => {
            await datastore.createGroup('My first group')
            
            assertThrow(async () => await datastore.renameGroup(2, 'new name'))
        })
    })


    it('getGroupIds returns the list of Id of the groups', async() => {
        await datastore.createGroup('My first group')
        await datastore.createGroup('My second group')
        await datastore.createGroup('My third group')
        var groupCount = await datastore.getGroupIds();

        assert.equal(groupCount.length, 3)
        assert.equal((await datastore.getGroupIds())[0], 1)
        assert.equal((await datastore.getGroupIds())[1], 2)
        assert.equal((await datastore.getGroupIds())[2], 3)
    })

    describe('getGroup', async () => {

        it('returns the list of entities in a group and its name', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            var group = await datastore.getGroup(1)

            assert.equal(group[0][0], '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            assert.equal(group[0][1], '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            assert.equal(group[1], 'My first group')
        })

        it("throws if group doesn't exist", async () => {            
            assertThrow(async () => await datastore.getGroup(2))
        })
    })        

   
      

    describe('addEntityToGroup', async () => {
        it('adds an entity to a group', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            
            const entities = (await datastore.getGroup(1))[0]

            assert.equal(entities[0], '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
        })

        it("throws if group doesn't exist", async () => {            
            assertThrow(async () => await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7'))
        })
    })     

    describe('removeEntityFromGroup', async () => {
        it('removes an entity from a group', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            await datastore.removeEntityFromGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            
            const entities = (await datastore.getGroup(1))[0]

            assert.equal(entities[0], 0)
            assert.equal(entities[1], '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
        })

        it('test', async() => {
            await datastore.createGroup('My first group')
            await datastore.removeEntityFromGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ff7')
        })        

        it("throws if group doesn't exist", async () => {            
            assertThrow(async () => await datastore.removeEntityFromGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7'))
        })
    })      

     describe('hasReadAccess', async () => {

        it('returns false when entity doesnt have permissions on it and isnt in a group that has', async() => {
            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
        })

        it("returns false when entity isn't in group", async() => {
            await datastore.createGroup('My first group')
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)
            await datastore.setGroupPermissions(1, 1, true, false)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
        })        

    })

    describe('hasWriteAccess', async () => {

        it('returns false when entity doesnt have permissions on it and isnt in a group that has', async() => {
            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)

            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
        })

        it("returns false when entity isn't in group", async() => {
            await datastore.createGroup('My first group')
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)
            await datastore.setGroupPermissions(1, 1, true, true)

            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
        })       

    })    


     describe('setMultiplePermissions', async () => {
    
        it('sets read and write permissions on a file', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')

            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)
            await datastore.setMultiplePermissions(1, [1], [true], [false], ['0xb4124ceb3451635dacedd11767f004d8a28c6ee8'], [false], [true], false)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), true)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), false)
        })
        
    })

    describe('setGroupPermissions', async () => {
    
        it('sets read and write permissions on a file', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)

            await datastore.setGroupPermissions(1, 1, true, true)
            await datastore.setGroupPermissions(1, 1, true, false)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), true)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), false)
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), true)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
        })

        it('sets read and write permissions on a file', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)
            await datastore.setGroupPermissions(1, 1, 0, 1)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), false)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), true)
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), true)
        })

        it("throws if not called by owner", async () => {  
            await datastore.createGroup('My first group')
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)

            assertThrow(async () => await datastore.setGroupPermissions(1, 1, true, false, { from: accounts[1] }))
        })        
    })

    describe('removeGroupFromFile', async () => {

        it('deletes a group from a file', async() => {
            await datastore.createGroup('My first group')
            await datastore.createGroup('My second group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')
            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)

            await datastore.setGroupPermissions(1, 2, true, true)
            await datastore.setGroupPermissions(1, 1, true, true)
            
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), true)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), true)
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), true)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), true)

            await datastore.removeGroupFromFile(1, 1)
            await datastore.removeGroupFromFile(1, 4)

            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), false)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')), false)
            assert.equal((await datastore.hasReadAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
            assert.equal((await datastore.hasWriteAccess(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ef7')), false)
        })

        it("throws if not called by owner", async () => {      
            await datastore.createGroup('My first group')
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)
            await datastore.setGroupPermissions(1, 1, true, true)
            
            assertThrow(async () => await datastore.removeGroupFromFile(1, 1, { from: accounts[1] }))
        })
    })       

    it('getGroupIds returns the array of groups Ids', async() => {
        await datastore.createGroup('My first group')
        await datastore.createGroup('My second group')
        await datastore.createGroup('My third group')

        assert.equal((await datastore.getGroupIds()).length, 3)
        assert.equal((await datastore.getGroupIds())[0], 1)
        assert.equal((await datastore.getGroupIds())[1], 2)
        assert.equal((await datastore.getGroupIds())[2], 3)
    })

    describe('setStorageProvider', async () => {
        it('fires the SettingsChanged event', async() => {
            await datastore.setStorageProvider(1)
            await assertEvent(datastore, { event: 'SettingsChanged' })
        })  
        
        it('throws if storage settings are set to another storage provider', async () => {
            await datastore.setStorageProvider(1)
            
            assertThrow(async () => {
                await datastore.setStorageProvider(2)
            })
        })         
    })

    describe('setIpfsStorageSettings', async () => {
        it('fires the SettingsChanged event', async() => {
            await datastore.setIpfsStorageSettings('localhost', 5001, 'http')
            await assertEvent(datastore, { event: 'SettingsChanged' })
        })

        it('throws if storage settings are set to another storage provider', async () => {
            await datastore.setStorageProvider(2)

            assertThrow(async () => {
                await datastore.setIpfsStorageSettings('localhost', 5001, 'http')
            })
        }) 
    })

    describe('setMultiplePermissions', async () => {
        it('sets a file public status', async() => {
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')

            const file1 = { 
                name: 'test name',
                storageRef: 'QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t',
                size: 4567,
                isPublic: false
            }
            await datastore.addFile(file1.storageRef, file1.name, file1.size, file1.isPublic)
            await datastore.setMultiplePermissions(1, [1], [true], [false], ['0xb4124ceb3451635dacedd11767f004d8a28c6ee8'], [false], [true], true)

            assert.equal((await datastore.getFileAsCaller(1, accounts[0]))[3], true)
        })

        it("throws if not called by owner", async () => {  
            await datastore.createGroup('My first group')
            await datastore.addEntityToGroup(1, '0xb4124ceb3451635dacedd11767f004d8a28c6ee7')
            await datastore.addFile("QmWWQSuPMS6aXCbZKpEjPHPUZN2NjB3YrhJTHsV4X3vb2t", "file name", 100, true)

            assertThrow(async () => {
                await datastore.setMultiplePermissions(1, [1], [true], [false], ['0xb4124ceb3451635dacedd11767f004d8a28c6ee8'], [false], [true], true, { from: accounts[1] })
            })
        })          
        
    })
})

async function assertThrow(fn) {
    try {
        await fn()
    } catch(e) {
        return true
    }
    assert.fail('Should have thrown')
}

async function assertEvent(contract, filter) {
    return new Promise((resolve, reject) => {
        if (!contract[filter.event])
            return reject(`No event named ${filter.event} found`)

        const event = contract[filter.event]()
        event.watch()
        event.get((error, logs) => {
            if (error)
                return reject(`Error while filtering events for ${filter.event}: ${e.message}`)

            const log = _.filter(logs, filter)

            if (log) 
                resolve(log)
            else {
                assert.fail(`Failed to find filtered event for ${filter.event}`)
                reject()
            }
            
        })
        event.stopWatching()
    })
}