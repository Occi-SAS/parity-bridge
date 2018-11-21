pragma solidity ^0.4.17;

contract Authorities {
    address[] public authorities;

    constructor (address[] _authorities) {
        authorities = _authorities;
    }

    modifier onlyAuthority() {
        require(isAuthority(msg.sender));
        _;
    }

    function isAuthority(address user) public view returns (bool) {
        for (uint i = 0; i < authorities.length; i++) {
            if (authorities[i] == user) {
                return true;
            }
        }
        return false;
    }

    function numAuthorities() public view returns (uint) {
        return authorities.length;
    }

    function setAuthority(address authorityAddress, bool _isAuthority) internal {
        if (_isAuthority && !isAuthority(authorityAddress)) {
            authorities.push(authorityAddress);
        }
        if (!_isAuthority) {
            for (uint i = 0; i < authorities.length; i++) {
                if (authorities[i] == authorityAddress) {
                    authorities[i] = authorities[authorities.length - 1];
                    authorities.length--;
                }
            }
        }
    }
}
