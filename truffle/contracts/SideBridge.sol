pragma solidity ^0.4.17;

import './Helpers.sol';
import './MessageSigning.sol';

contract SideBridge {
    struct SignaturesCollection {
        /// Signed message.
        bytes message;
        /// Authorities who signed the message.
        address[] authorities;
        /// Signatures
        bytes[] signatures;
    }

    /// Number of authorities signatures required to withdraw the money.
    ///
    /// Must be less than number of authorities.
    uint256 public requiredSignatures;

    /// Contract authorities.
    address[] public authorities;

    /// Pending deposits and authorities who confirmed them
    mapping (bytes32 => address[]) deposits;

    /// Pending signatures and authorities who confirmed them
    mapping (bytes32 => SignaturesCollection) signatures;

    /// triggered when an authority confirms a deposit
    event DepositConfirmation(address recipient, uint256 value, bytes32 transactionHash);

    /// triggered when enough authorities have confirmed a deposit
    event Deposit(address recipient, uint256 value, bytes32 transactionHash);

    /// Event created on money withdraw.
    event Withdraw(address recipient, uint256 value, uint256 mainGasPrice);

    event WithdrawSignatureSubmitted(bytes32 messageHash);

    /// Collected signatures which should be relayed to main chain.
    event CollectedSignatures(address indexed authorityResponsibleForRelay, bytes32 messageHash);

    function SideBridge(
        uint256 _requiredSignatures,
        address[] _authorities
    ) public payable
    {
        require(_requiredSignatures != 0);
        require(_requiredSignatures <= _authorities.length);
        requiredSignatures = _requiredSignatures;
        authorities = _authorities;
    }

    // Called by the bridge node processes on startup
    // to determine early whether the address pointing to the side
    // bridge contract is misconfigured.
    // so we can provide a helpful error message instead of the
    // very unhelpful errors encountered otherwise.
    function isSideBridgeContract() public pure returns (bool) {
        return true;
    }

    /// require that sender is an authority
    modifier onlyAuthority() {
        require(Helpers.addressArrayContains(authorities, msg.sender));
        _;
    }

    /// Used to deposit money to the contract.
    ///
    /// deposit recipient (bytes20)
    /// deposit value (uint256)
    /// mainnet transaction hash (bytes32) // to avoid transaction duplication
    function deposit(address recipient, uint256 value, bytes32 transactionHash) public onlyAuthority() {
        // Protection from misbehaving authority
        var hash = keccak256(recipient, value, transactionHash);

        // don't allow authority to confirm deposit twice
        require(!Helpers.addressArrayContains(deposits[hash], msg.sender));

        deposits[hash].push(msg.sender);

        // TODO: this may cause troubles if requiredSignatures len is changed
        if (deposits[hash].length != requiredSignatures) {
            DepositConfirmation(recipient, value, transactionHash);
            return;
        }

        recipient.transfer(value);
        Deposit(recipient, value, transactionHash);
    }

    // Shortcut to allow users to transfer their sidechain ETH back to the main chain
    function () public payable {
        transferToMainViaRelay(msg.sender);
    }

    /// Transfer ETH from `msg.sender` (on `side` chain) to `recipient` on `main` chain.
    ///
    /// emits a `Withdraw` event which will be picked up by the bridge authorities.
    /// bridge authorities will then sign off (by calling `submitSignature`) on a message containing `value`,
    /// `recipient` and the `hash` of the transaction on `side` containing the `Withdraw` event.
    /// once `requiredSignatures` are collected a `CollectedSignatures` event will be emitted.
    /// an authority will pick up `CollectedSignatures` an call `MainBridge.withdraw`
    /// which transfers `value - relayCost` to `recipient` completing the transfer.
    function transferToMainViaRelay(address recipient) public payable {
        // don't allow 0 value transfers to main
        require(msg.value > 0);

        Withdraw(recipient, msg.value, 0);
    }

    /// Should be used as sync tool
    ///
    /// Message is a message that should be relayed to main chain once authorities sign it.
    ///
    /// for withdraw message contains:
    /// withdrawal recipient (bytes20)
    /// withdrawal value (uint256)
    /// side transaction hash (bytes32) // to avoid transaction duplication
    function submitSignature(bytes signature, bytes message) public onlyAuthority() {
        // ensure that `signature` is really `message` signed by `msg.sender`
        require(msg.sender == MessageSigning.recoverAddressFromSignedMessage(signature, message));

        require(message.length == 116);
        var hash = keccak256(message);

        // each authority can only provide one signature per message
        require(!Helpers.addressArrayContains(signatures[hash].authorities, msg.sender));
        signatures[hash].message = message;
        signatures[hash].authorities.push(msg.sender);
        signatures[hash].signatures.push(signature);

        // TODO: this may cause troubles if requiredSignatures len is changed
        if (signatures[hash].authorities.length == requiredSignatures) {
            CollectedSignatures(msg.sender, hash);
        } else {
            WithdrawSignatureSubmitted(hash);
        }
    }

    function hasAuthoritySignedMainToSide(address authority, address recipient, uint256 value, bytes32 mainTxHash) public view returns (bool) {
        var hash = keccak256(recipient, value, mainTxHash);

        return Helpers.addressArrayContains(deposits[hash], authority);
    }

    function hasAuthoritySignedSideToMain(address authority, bytes message) public view returns (bool) {
        require(message.length == 116);
        var messageHash = keccak256(message);
        return Helpers.addressArrayContains(signatures[messageHash].authorities, authority);
    }

    /// Get signature
    function signature(bytes32 messageHash, uint256 index) public view returns (bytes) {
        return signatures[messageHash].signatures[index];
    }

    /// Get message
    function message(bytes32 message_hash) public view returns (bytes) {
        return signatures[message_hash].message;
    }
}
