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

    mapping(address => uint256) public lastBalanceDelta;

    bool disabled;

    function disable() external {
        disabled = true;
    }

    modifier isEnabled() {
        require(!disabled);
        _;
    }

    function transfer(address to, uint256 value) external isEnabled returns (bool) {
        lastBalanceDelta[msg.sender] = value;
        lastBalanceDelta[to] = value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function callDeposit(address bridge, address recipient, uint256 value) external isEnabled {
        IBridge(bridge).deposit(recipient, value);
    }
}
