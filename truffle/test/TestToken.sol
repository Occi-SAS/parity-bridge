pragma solidity ^0.4.24;

interface IBridge {
    function deposit(address owner, uint256 tokens) external;
}

/// Library used only to test Message library via rpc calls
contract TestToken {
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 value
    );

    mapping(address => uint256) balances;

    constructor() {
        balances[msg.sender] = 1000 ether;
    }

    function transfer(address to, uint256 value) external {
        emit Transfer(msg.sender, to, value);
    }

    function callDeposit(address bridge, address recipient, uint256 value) external {
        IBridge(bridge).deposit(recipient, value);
    }
}
