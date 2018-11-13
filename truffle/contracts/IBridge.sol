pragma solidity ^0.4.24;

interface IBridge {
    function deposit(address owner, uint256 tokens) external;
}
