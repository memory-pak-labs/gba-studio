#include <cassert>
#include <cstring>
#include "gbs/containers.hpp"

using namespace gbs;

void test_optional() {
    gbs::Optional<int> opt1;
    assert(!opt1.has_value);
    assert(opt1.value_or(42) == 42);
    assert(opt1 == gbs::Optional<int>());

    gbs::Optional<int> opt2(42);
    assert(opt2.has_value);
    assert(*opt2 == 42);
    assert(opt2.value_or(0) == 42);

    gbs::Optional<int> a(10), b(10), c(20);
    assert(a == b);
    assert(a != c);

    gbs::Optional<int> empty;
    assert(empty.value_or(99) == 99);
    gbs::Optional<int> with_val(5);
    assert(with_val.value_or(0) == 5);
}

void test_string() {
    gbs::String32 s1("hello");
    assert(s1.size() == 5);
    assert(strcmp(s1.c_str(), "hello") == 0);
    assert(s1[0] == 'h');
    assert(s1[4] == 'o');

    gbs::String32 s2;
    s2.assign("world");
    assert(s2.size() == 5);
    assert(strcmp(s2.c_str(), "world") == 0);

    gbs::String32 a("hello"), b("hello"), c("world");
    assert(a == b);
    assert(a != c);
    assert(a < c);

    gbs::String32 s;
    s.push_back('a');
    s.push_back('b');
    assert(s.size() == 2);
    assert(s[0] == 'a');
    assert(s[1] == 'b');
    s.pop_back();
    assert(s.size() == 1);
    s.pop_back();
    assert(s.empty());

    gbs::String32 s3;
    s3.assign("test");
    assert(s3.size() == 4);
    s3.assign("abc", 2);
    assert(s3.size() == 2);
    assert(strcmp(s3.c_str(), "ab") == 0);

    gbs::String32 s4("hello");
    s4.clear();
    assert(s4.empty());
}

void test_vector() {
    gbs::Vector<int, 8> vec;
    assert(vec.empty());
    assert(vec.capacity() == 8);

    for (int i = 0; i < 5; ++i) {
        vec.push_back(i * 2);
    }
    assert(vec.size() == 5);
    for (int i = 0; i < 5; ++i) {
        assert(vec[i] == i * 2);
    }

    assert(vec.front() == 0);
    assert(vec.back() == 8);

    vec.pop_back();
    assert(vec.size() == 4);
    assert(vec.back() == 6);

    assert(vec.at(0) == 0);
    assert(vec.at(3) == 6);

    vec.clear();
    assert(vec.empty());

    gbs::Vector<int, 4> v;
    v.resize(3, 7);
    assert(v.size() == 3);
    assert(v[0] == 7 && v[1] == 7 && v[2] == 7);

    gbs::Vector<int, 4> a, b;
    a.push_back(1); a.push_back(2);
    b.push_back(1); b.push_back(2);
    assert(a == b);
    b.push_back(3);
    assert(a != b);
}

int main() {
    test_optional();
    test_string();
    test_vector();
    return 0;
}