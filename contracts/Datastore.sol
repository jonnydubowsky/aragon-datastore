pragma solidity ^0.4.18;

pragma experimental ABIEncoderV2;

contract Datastore {

    struct File {
        string storageRef;
        string name;
        uint fileSize;
        string keepRef;
        bool isPublic;
        bool isDeleted;
        address owner;
        uint lastModification;
        mapping (address => Permission) permissions;
    }

    struct Permission {
        bool write;
        bool read;
    }

    uint public lastFileId = 0;

    mapping (uint => File) private files;
    

    function addFile(string _storageRef, string _name, uint _fileSize, bool _isPublic) external returns (uint fileId) {
        lastFileId++;
        files[lastFileId] = File({ 
            storageRef: _storageRef,
            name: _name,
            fileSize: _fileSize,
            keepRef: "",
            isPublic: _isPublic,
            isDeleted: false,
            owner: msg.sender,
            lastModification: now
        });
        return lastFileId;
    }

    function renameFile(uint _fileId, string _newName) external {
        files[_fileId].name = _newName;
    }

    function updateContent(uint _fileId, string _storageRef, uint _fileSize) external {
        files[_fileId].storageRef = _storageRef;
        files[_fileId].fileSize = _fileSize;
    }

    function getFile(uint _fileId) 
        external
        view 
        returns (
            string storageRef,
            string name,
            uint fileSize,
            string keepRef,
            bool isPublic,
            bool isDeleted,
            address owner,
            uint lastModification
        ) 
    {
        File storage file = files[_fileId];

        storageRef = file.storageRef;
        name = file.name;
        fileSize = file.fileSize;
        keepRef = file.keepRef;
        isPublic = file.isPublic;
        isDeleted = file.isDeleted;
        owner = file.owner;
        lastModification = file.lastModification;
    }

    function deleteFile(uint _fileId) public {
        require(isOwner(_fileId, msg.sender));

        files[_fileId].isDeleted = true;
    }

    function setWritePermission(uint _fileId, address _entity, bool _hasPermission) external {
        require(isOwner(_fileId, msg.sender));

        files[_fileId].permissions[_entity].write = _hasPermission;
    }

    function isOwner(uint _fileId, address _entity) public view returns (bool) {
        return files[_fileId].owner == _entity;
    }
}
